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
import { User } from '../../users/entities/user.entity';
import { AiGenerationStatus } from '../enums/ai-generation-status.enum';
import { AiGenerationType } from '../enums/ai-generation-type.enum';

@Entity('ai_generations')
@Index(['companyId'])
@Index(['userId'])
@Index(['type'])
@Index(['status'])
@Index(['createdAt'])
export class AiGeneration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({
    type: 'enum',
    enum: AiGenerationType,
  })
  type!: AiGenerationType;

  @Column({
    type: 'enum',
    enum: AiGenerationStatus,
  })
  status!: AiGenerationStatus;

  @Column({ type: 'varchar', length: 80 })
  provider!: string;

  @Column({ type: 'varchar', length: 120 })
  model!: string;

  @Column({ type: 'jsonb' })
  input!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  output!: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'tokens_used', type: 'int', nullable: true })
  tokensUsed!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}