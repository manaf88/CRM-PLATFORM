import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';

import {
  DEFAULT_TIMEZONE,
  hoursSince,
} from '../../common/utils/dashboard-time.util';
import { ContentPost } from '../content/entities/content-post.entity';
import { ContentPostStatus } from '../content/enums/content-post-status.enum';
import { MailService } from '../mail/mail.service';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationPreferencesService } from '../notifications/notification-preferences.service';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatus } from '../tasks/enums/task-status.enum';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';

const HOUR_MS = 60 * 60 * 1000;

type DigestLine = {
  text: string;
  link: string;
};

type DigestSection = {
  heading: string;
  type: NotificationType;
  lines: DigestLine[];
};

/**
 * One email a day, to the people who have something waiting.
 *
 * Nothing waiting means nothing sent — a digest that arrives every morning
 * saying "all clear" is a digest people filter into a folder.
 */
@Injectable()
export class DailyDigestService {
  private readonly logger = new Logger(DailyDigestService.name);

  /**
   * The calendar day, in the agency's zone, each run already covered. In
   * memory on purpose: a restart inside the send hour may send a second copy,
   * which is a nuisance, while a table to prevent it is a schema to maintain.
   */
  private lastSentDay: string | null = null;

  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,

    @InjectRepository(ContentPost)
    private readonly postsRepository: Repository<ContentPost>,

    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    private readonly preferencesService: NotificationPreferencesService,
    private readonly membershipsService: MembershipsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 * * * *', { name: 'daily-digest' })
  async maybeSend(): Promise<{ sent: number; skipped: boolean }> {
    const now = new Date();
    const { hour, day } = this.localParts(now);
    const sendHour = this.configService.get<number>('app.digestHour') ?? 8;

    if (hour !== sendHour || this.lastSentDay === day) {
      return { sent: 0, skipped: true };
    }

    this.lastSentDay = day;

    const sent = await this.send(now);

    this.logger.log(`Daily digest: ${sent} emails`);

    return { sent, skipped: false };
  }

  /** Exposed so it can be run by hand, and tested, without waiting for 08:00. */
  async send(now: Date = new Date()): Promise<number> {
    const sections = await this.collect(now);

    if (sections.size === 0) {
      return 0;
    }

    const recipients = [...sections.keys()];

    const [wanted, users] = await Promise.all([
      this.preferencesService.findUsersWantingDigest(recipients),
      this.usersRepository.find({
        where: { id: In(recipients), status: UserStatus.ACTIVE },
      }),
    ]);

    let sent = 0;

    for (const user of users) {
      if (!wanted.has(user.id)) {
        continue;
      }

      const muted = await this.preferencesService.findMutedTypes(user.id);

      const visible = (sections.get(user.id) ?? []).filter(
        (section) => !muted.includes(section.type) && section.lines.length > 0,
      );

      if (visible.length === 0) {
        continue;
      }

      await this.mailService.send({
        to: user.email,
        subject: this.subject(visible),
        text: this.body(user.fullName, visible),
      });

      sent += 1;
    }

    return sent;
  }

  /** Everything worth an email this morning, grouped by who should get it. */
  private async collect(now: Date): Promise<Map<string, DigestSection[]>> {
    const byUser = new Map<string, DigestSection[]>();

    const add = (
      userId: string,
      heading: string,
      type: NotificationType,
      line: DigestLine,
    ) => {
      const sections = byUser.get(userId) ?? [];
      const existing = sections.find((section) => section.type === type);

      if (existing) {
        existing.lines.push(line);
      } else {
        sections.push({ heading, type, lines: [line] });
      }

      byUser.set(userId, sections);
    };

    const waiting = await this.tasksRepository.find({
      where: {
        status: TaskStatus.IN_REVIEW,
        approverId: Not(IsNull()),
        submittedForReviewAt: Not(IsNull()),
      },
      relations: { assignedTo: true },
    });

    for (const task of waiting) {
      const age = task.submittedForReviewAt
        ? hoursSince(task.submittedForReviewAt, now)
        : 0;

      add(
        task.approverId as string,
        'Waiting for your approval',
        NotificationType.TASK_SUBMITTED_FOR_REVIEW,
        {
          text: `${task.title} — ${this.age(age)}, from ${task.assignedTo?.fullName ?? 'somebody'}`,
          link: `/tasks/${task.id}`,
        },
      );
    }

    const sentBack = await this.tasksRepository.find({
      where: {
        status: TaskStatus.IN_PROGRESS,
        assignedToId: Not(IsNull()),
        reviewNote: Not(IsNull()),
        reviewedAt: MoreThanOrEqual(new Date(now.getTime() - 24 * HOUR_MS)),
      },
    });

    for (const task of sentBack) {
      add(
        task.assignedToId as string,
        'Sent back to you',
        NotificationType.TASK_CHANGES_REQUESTED,
        {
          text: `${task.title} — ${task.reviewNote ?? 'changes requested'}`,
          link: `/tasks/${task.id}`,
        },
      );
    }

    const stalePosts = await this.postsRepository.find({
      where: {
        status: ContentPostStatus.READY_FOR_CLIENT,
        updatedAt: LessThanOrEqual(new Date(now.getTime() - 48 * HOUR_MS)),
      },
    });

    for (const post of stalePosts) {
      const reviewers = await this.membershipsService.findActiveMembersByRoles(
        post.companyId,
        [
          CompanyMembershipRole.CLIENT_OWNER,
          CompanyMembershipRole.CLIENT_REVIEWER,
        ],
      );

      for (const reviewer of reviewers) {
        add(
          reviewer.userId,
          'Waiting for your review',
          NotificationType.POST_SUBMITTED_TO_CLIENT,
          {
            text: `${post.title} — ${this.age(hoursSince(post.updatedAt, now))}`,
            link: `/posts/${post.id}`,
          },
        );
      }
    }

    return byUser;
  }

  private subject(sections: DigestSection[]): string {
    const count = sections.reduce(
      (total, section) => total + section.lines.length,
      0,
    );

    return count === 1
      ? 'One thing is waiting on you'
      : `${count} things are waiting on you`;
  }

  private body(fullName: string, sections: DigestSection[]): string {
    const base = this.frontendBaseUrl();
    const lines: string[] = [`Good morning ${fullName},`, ''];

    for (const section of sections) {
      lines.push(`${section.heading}:`);

      for (const line of section.lines) {
        lines.push(`  · ${line.text}`);
        lines.push(`    ${base}${line.link}`);
      }

      lines.push('');
    }

    lines.push('You can turn this email off in your notification settings.');

    return lines.join('\n');
  }

  private age(hours: number): string {
    if (hours < 24) {
      return `waiting ${hours} hour${hours === 1 ? '' : 's'}`;
    }

    const days = Math.floor(hours / 24);

    return `waiting ${days} day${days === 1 ? '' : 's'}`;
  }

  private localParts(date: Date): { hour: number; day: string } {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_TIMEZONE,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    });

    const parts: Record<string, string> = {};

    for (const part of formatter.formatToParts(date)) {
      if (part.type !== 'literal') {
        parts[part.type] = part.value;
      }
    }

    return {
      hour: Number(parts.hour) % 24,
      day: `${parts.year}-${parts.month}-${parts.day}`,
    };
  }

  private frontendBaseUrl(): string {
    const configured =
      this.configService.get<string>('app.frontendUrl') ??
      'http://localhost:5173';

    return configured.split(',')[0].trim().replace(/\/+$/, '');
  }
}
