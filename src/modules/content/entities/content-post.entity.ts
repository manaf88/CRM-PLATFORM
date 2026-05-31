import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';
import { ContentPlatform } from '../enums/content-platform.enum';
import { ContentPostStatus } from '../enums/content-post-status.enum';
import { ContentType } from '../enums/content-type.enum';
import { ContentPlan } from './content-plan.entity';

@Entity('posts')
@Index(['companyId'])
@Index(['contentPlanId'])
@Index(['companyId', 'status'])
@Index(['companyId', 'scheduledAt'])
@Index(['platform'])
@Index(['contentType'])
export class ContentPost {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ name: 'content_plan_id', type: 'uuid', nullable: true })
  contentPlanId!: string | null;

  @ManyToOne(() => ContentPlan, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_plan_id' })
  contentPlan!: ContentPlan | null;

  @Column({ type: 'varchar', length: 180 })
  title!: string;

  @Column({
    name: 'content_type',
    type: 'enum',
    enum: ContentType,
  })
  contentType!: ContentType;

  @Column({
    type: 'enum',
    enum: ContentPlatform,
  })
  platform!: ContentPlatform;

  @Column({ type: 'text', nullable: true })
  caption!: string | null;

  @Column({ name: 'visual_brief', type: 'text', nullable: true })
  visualBrief!: string | null;

  @Column({
    type: 'enum',
    enum: ContentPostStatus,
    default: ContentPostStatus.DRAFT,
  })
  status!: ContentPostStatus;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ name: 'published_url', type: 'text', nullable: true })
  publishedUrl!: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_id' })
  updatedBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}