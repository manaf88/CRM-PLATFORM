import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';

import { AutomationEngineService } from '../automations/automation-engine.service';
import { RequestUser } from '../auth/types/request-user.type';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { FindLeadsQueryDto } from './dto/find-leads-query.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadNote } from './entities/lead-note.entity';
import { LeadStatusHistory } from './entities/lead-status-history.entity';
import { Lead } from './entities/lead.entity';
import { LeadSource } from './enums/lead-source.enum';
import { LeadStatus } from './enums/lead-status.enum';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,

    @InjectRepository(LeadNote)
    private readonly leadNotesRepository: Repository<LeadNote>,

    @InjectRepository(LeadStatusHistory)
    private readonly leadStatusHistoryRepository: Repository<LeadStatusHistory>,

    private readonly membershipsService: MembershipsService,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly automationEngineService: AutomationEngineService,
  ) {}

  async create(
    companyId: string,
    dto: CreateLeadDto,
    currentUser: RequestUser,
  ): Promise<Lead> {
    await this.validateAssignedUser(companyId, dto.assignedToId);

    const lead = this.leadsRepository.create({
      companyId,
      name: dto.name.trim(),
      phone: this.cleanOptionalString(dto.phone),
      email: this.cleanOptionalString(dto.email)?.toLowerCase() ?? null,
      source: dto.source ?? LeadSource.MANUAL,
      interestedService: this.cleanOptionalString(dto.interestedService),
      assignedToId: dto.assignedToId ?? null,
      nextFollowUpAt: dto.nextFollowUpAt
        ? new Date(dto.nextFollowUpAt)
        : null,
      notes: this.cleanOptionalString(dto.notes),
      createdById: currentUser.id,
      updatedById: currentUser.id,
    });

    const savedLead = await this.dataSource.transaction(async (manager) => {
      const savedLead = await manager.getRepository(Lead).save(lead);

      const history = manager.getRepository(LeadStatusHistory).create({
        companyId,
        leadId: savedLead.id,
        fromStatus: null,
        toStatus: LeadStatus.NEW,
        changedById: currentUser.id,
        note: 'Lead created',
      });

      await manager.getRepository(LeadStatusHistory).save(history);

      return savedLead;
    });

    await this.notifyLeadAssigned({
      lead: savedLead,
      currentUser,
    });

    return savedLead;
  }

  async findAll(companyId: string, query: FindLeadsQueryDto) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;

    const queryBuilder = this.leadsRepository
      .createQueryBuilder('lead')
      .where('lead.companyId = :companyId', { companyId });

    if (query.status) {
      queryBuilder.andWhere('lead.status = :status', {
        status: query.status,
      });
    }

    if (query.source) {
      queryBuilder.andWhere('lead.source = :source', {
        source: query.source,
      });
    }

    if (query.assignedToId) {
      queryBuilder.andWhere('lead.assignedToId = :assignedToId', {
        assignedToId: query.assignedToId,
      });
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;

      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('lead.name ILIKE :search', { search })
            .orWhere('lead.phone ILIKE :search', { search })
            .orWhere('lead.email ILIKE :search', { search })
            .orWhere('lead.interestedService ILIKE :search', { search });
        }),
      );
    }

    queryBuilder
      .orderBy('lead.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async findOne(companyId: string, leadId: string): Promise<Lead> {
    const lead = await this.leadsRepository.findOne({
      where: {
        id: leadId,
        companyId,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  async update(
    companyId: string,
    leadId: string,
    dto: UpdateLeadDto,
    currentUser: RequestUser,
  ): Promise<Lead> {
    await this.validateAssignedUser(companyId, dto.assignedToId);

    const lead = await this.findOne(companyId, leadId);
    const previousAssignedToId = lead.assignedToId;

    if (dto.name !== undefined) {
      lead.name = dto.name.trim();
    }

    if (dto.phone !== undefined) {
      lead.phone = this.cleanOptionalString(dto.phone);
    }

    if (dto.email !== undefined) {
      lead.email = this.cleanOptionalString(dto.email)?.toLowerCase() ?? null;
    }

    if (dto.source !== undefined) {
      lead.source = dto.source;
    }

    if (dto.interestedService !== undefined) {
      lead.interestedService = this.cleanOptionalString(dto.interestedService);
    }

    if (dto.assignedToId !== undefined) {
      lead.assignedToId = dto.assignedToId || null;
    }

    if (dto.nextFollowUpAt !== undefined) {
      lead.nextFollowUpAt = dto.nextFollowUpAt
        ? new Date(dto.nextFollowUpAt)
        : null;
    }

    if (dto.notes !== undefined) {
      lead.notes = this.cleanOptionalString(dto.notes);
    }

    lead.updatedById = currentUser.id;

    const savedLead = await this.leadsRepository.save(lead);

    await this.notifyLeadAssigned({
      lead: savedLead,
      currentUser,
      previousAssignedToId,
    });

    return savedLead;
  }

  async updateStatus(
    companyId: string,
    leadId: string,
    dto: UpdateLeadStatusDto,
    currentUser: RequestUser,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const leadsRepository = manager.getRepository(Lead);
      const historyRepository = manager.getRepository(LeadStatusHistory);

      const lead = await leadsRepository.findOne({
        where: {
          id: leadId,
          companyId,
        },
      });

      if (!lead) {
        throw new NotFoundException('Lead not found');
      }

      if (lead.status === dto.status) {
        throw new BadRequestException(
          `Lead is already in status ${dto.status}`,
        );
      }

      const fromStatus = lead.status;

      lead.status = dto.status;
      lead.updatedById = currentUser.id;

      if (
        dto.status === LeadStatus.CONTACTED ||
        dto.status === LeadStatus.INTERESTED ||
        dto.status === LeadStatus.WAITING_DECISION ||
        dto.status === LeadStatus.WON ||
        dto.status === LeadStatus.LOST
      ) {
        lead.lastContactAt = new Date();
      }

      const savedLead = await leadsRepository.save(lead);

      const history = historyRepository.create({
        companyId,
        leadId,
        fromStatus,
        toStatus: dto.status,
        changedById: currentUser.id,
        note: this.cleanOptionalString(dto.note),
      });

      const savedHistory = await historyRepository.save(history);

      return {
        lead: savedLead,
        statusHistory: savedHistory,
      };
    });

    await this.notifyLeadStatusChanged({
      lead: result.lead,
      currentUser,
    });

    if (result.lead.status === LeadStatus.INTERESTED) {
      await this.triggerLeadBecameInterestedAutomation({
        companyId,
        lead: result.lead,
        currentUser,
      });
    }

    return result;
  }

  async addNote(
    companyId: string,
    leadId: string,
    dto: CreateLeadNoteDto,
    currentUser: RequestUser,
  ): Promise<LeadNote> {
    const lead = await this.findOne(companyId, leadId);

    const note = this.leadNotesRepository.create({
      companyId,
      leadId,
      userId: currentUser.id,
      note: dto.note.trim(),
    });

    const savedNote = await this.leadNotesRepository.save(note);

    await this.notifyLeadNoteAdded({
      lead,
      noteId: savedNote.id,
      currentUser,
    });

    return savedNote;
  }

  async findNotes(companyId: string, leadId: string): Promise<LeadNote[]> {
    await this.findOne(companyId, leadId);

    return this.leadNotesRepository.find({
      where: {
        companyId,
        leadId,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async findStatusHistory(
    companyId: string,
    leadId: string,
  ): Promise<LeadStatusHistory[]> {
    await this.findOne(companyId, leadId);

    return this.leadStatusHistoryRepository.find({
      where: {
        companyId,
        leadId,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  private async notifyLeadAssigned(input: {
    lead: Lead;
    currentUser: RequestUser;
    previousAssignedToId?: string | null;
  }): Promise<void> {
    const { lead, currentUser, previousAssignedToId } = input;

    if (!lead.assignedToId) {
      return;
    }

    if (lead.assignedToId === currentUser.id) {
      return;
    }

    if (
      previousAssignedToId !== undefined &&
      previousAssignedToId === lead.assignedToId
    ) {
      return;
    }

    try {
      await this.notificationsService.create({
        companyId: lead.companyId,
        recipientUserId: lead.assignedToId,
        type: NotificationType.LEAD_ASSIGNED,
        title: 'New lead assigned',
        message: `You have been assigned a lead: ${lead.name}`,
        entityType: NotificationEntityType.LEAD,
        entityId: lead.id,
        metadata: {
          source: lead.source,
          interestedService: lead.interestedService,
          status: lead.status,
          nextFollowUpAt: lead.nextFollowUpAt,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to create LEAD_ASSIGNED notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async notifyLeadStatusChanged(input: {
    lead: Lead;
    currentUser: RequestUser;
  }): Promise<void> {
    const { lead, currentUser } = input;

    if (!lead.assignedToId) {
      return;
    }

    if (lead.assignedToId === currentUser.id) {
      return;
    }

    try {
      await this.notificationsService.create({
        companyId: lead.companyId,
        recipientUserId: lead.assignedToId,
        type: NotificationType.LEAD_STATUS_CHANGED,
        title: 'Lead status updated',
        message: `Lead "${lead.name}" changed to ${lead.status}`,
        entityType: NotificationEntityType.LEAD,
        entityId: lead.id,
        metadata: {
          source: lead.source,
          interestedService: lead.interestedService,
          status: lead.status,
          nextFollowUpAt: lead.nextFollowUpAt,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to create LEAD_STATUS_CHANGED notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async notifyLeadNoteAdded(input: {
    lead: Lead;
    noteId: string;
    currentUser: RequestUser;
  }): Promise<void> {
    const { lead, noteId, currentUser } = input;

    if (!lead.assignedToId) {
      return;
    }

    if (lead.assignedToId === currentUser.id) {
      return;
    }

    try {
      await this.notificationsService.create({
        companyId: lead.companyId,
        recipientUserId: lead.assignedToId,
        type: NotificationType.LEAD_NOTE_ADDED,
        title: 'New note on lead',
        message: `A new note was added to lead: ${lead.name}`,
        entityType: NotificationEntityType.LEAD,
        entityId: lead.id,
        metadata: {
          noteId,
          source: lead.source,
          interestedService: lead.interestedService,
          status: lead.status,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to create LEAD_NOTE_ADDED notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async triggerLeadBecameInterestedAutomation(input: {
    companyId: string;
    lead: Lead;
    currentUser: RequestUser;
  }): Promise<void> {
    const { companyId, lead, currentUser } = input;

    try {
      await this.automationEngineService.handleLeadBecameInterested({
        companyId,
        leadId: lead.id,
        leadName: lead.name,
        assignedToId: lead.assignedToId,
        currentUser,
      });
    } catch (error) {
      this.logger.error(
        'Failed to trigger LEAD_BECAME_INTERESTED automation',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async validateAssignedUser(
    companyId: string,
    assignedToId?: string,
  ): Promise<void> {
    if (!assignedToId) {
      return;
    }

    const hasMembership =
      await this.membershipsService.existsActiveMembership(
        assignedToId,
        companyId,
      );

    if (!hasMembership) {
      throw new BadRequestException(
        'Assigned user is not an active member of this company',
      );
    }
  }

  private cleanOptionalString(value?: string): string | null {
    if (value === undefined) {
      return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
  }
}