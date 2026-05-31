import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Company } from '../../companies/entities/company.entity';
import { AutomationActionType } from '../enums/automation-action-type.enum';
import { AutomationRunStatus } from '../enums/automation-run-status.enum';
import { AutomationTriggerType } from '../enums/automation-trigger-type.enum';
import { AutomationRule } from './automation-rule.entity';

@Entity('automation_runs')
@Index(['companyId'])
@Index(['automationRuleId'])
@Index(['triggerType'])
@Index(['actionType'])
@Index(['status'])
@Index(['createdAt'])
export class AutomationRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ name: 'automation_rule_id', type: 'uuid', nullable: true })
  automationRuleId!: string | null;

  @ManyToOne(() => AutomationRule, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'automation_rule_id' })
  automationRule!: AutomationRule | null;

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

  @Column({
    type: 'enum',
    enum: AutomationRunStatus,
  })
  status!: AutomationRunStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  input!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  output!: Record<string, unknown>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}