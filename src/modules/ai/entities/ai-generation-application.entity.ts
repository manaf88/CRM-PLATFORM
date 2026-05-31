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
import { AiGenerationApplicationType } from '../enums/ai-generation-application-type.enum';
import { AiGeneration } from './ai-generation.entity';

@Entity('ai_generation_applications')
@Index(['companyId'])
@Index(['generationId'])
@Index(['applicationType'])
@Index(['createdAt'])
export class AiGenerationApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ name: 'generation_id', type: 'uuid' })
  generationId!: string;

  @ManyToOne(() => AiGeneration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'generation_id' })
  generation!: AiGeneration;

  @Column({ name: 'applied_by_id', type: 'uuid', nullable: true })
  appliedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'applied_by_id' })
  appliedBy!: User | null;

  @Column({
    name: 'application_type',
    type: 'enum',
    enum: AiGenerationApplicationType,
  })
  applicationType!: AiGenerationApplicationType;

  @Column({ name: 'source_index', type: 'int', nullable: true })
  sourceIndex!: number | null;

  @Column({ name: 'entity_type', type: 'varchar', length: 80 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}