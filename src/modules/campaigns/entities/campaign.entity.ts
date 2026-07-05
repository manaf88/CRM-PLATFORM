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
import { CampaignObjective } from '../enums/campaign-objective.enum';
import { CampaignStatus } from '../enums/campaign-status.enum';

@Entity('campaigns')
@Index(['companyId'])
@Index(['companyId', 'status'])
@Index(['companyId', 'objective'])
@Index(['startDate'])
@Index(['endDate'])
@Index(['createdAt'])
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ type: 'varchar', length: 180 })
  name!: string;

  @Column({
    type: 'enum',
    enum: CampaignObjective,
    default: CampaignObjective.AWARENESS,
  })
  objective!: CampaignObjective;

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    default: CampaignStatus.DRAFT,
  })
  status!: CampaignStatus;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'start_date', type: 'timestamptz', nullable: true })
  startDate!: Date | null;

  @Column({ name: 'end_date', type: 'timestamptz', nullable: true })
  endDate!: Date | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  budget!: string | null;

  @Column({ type: 'varchar', length: 12, nullable: true })
  currency!: string | null;

  @Column({ name: 'target_audience', type: 'text', nullable: true })
  targetAudience!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

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