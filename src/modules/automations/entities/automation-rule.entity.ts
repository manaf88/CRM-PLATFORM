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
import { AutomationActionType } from '../enums/automation-action-type.enum';
import { AutomationTriggerType } from '../enums/automation-trigger-type.enum';

@Entity('automation_rules')
@Index(['companyId'])
@Index(['companyId', 'triggerType'])
@Index(['companyId', 'actionType'])
@Index(['companyId', 'isActive'])
@Index(['createdAt'])
export class AutomationRule {
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
    name: 'trigger_type',
    type: 'enum',
    enum: AutomationTriggerType,
  })
  triggerType!: AutomationTriggerType;

  @Column({
    name: 'action_type',
    type: 'enum',
    enum: AutomationActionType,
  })
  actionType!: AutomationActionType;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  config!: Record<string, unknown>;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}