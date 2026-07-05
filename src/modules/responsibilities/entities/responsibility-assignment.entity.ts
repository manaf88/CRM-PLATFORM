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
import { ResponsibilityType } from '../enums/responsibility-type.enum';
import { ResponsibilityArea } from './responsibility-area.entity';

/**
 * One cell of the responsibility matrix:
 * a given member holds a single responsibility type within a given area.
 *
 * The unique index on (companyId, areaId, memberUserId) enforces the
 * single-value-per-cell behaviour of the source spreadsheet.
 */
@Entity('responsibility_assignments')
@Index(['companyId'])
@Index(['companyId', 'areaId'])
@Index(['companyId', 'memberUserId'])
@Index(['type'])
@Index(['companyId', 'areaId', 'memberUserId'], { unique: true })
export class ResponsibilityAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ name: 'area_id', type: 'uuid' })
  areaId!: string;

  @ManyToOne(() => ResponsibilityArea, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'area_id' })
  area!: ResponsibilityArea;

  @Column({ name: 'member_user_id', type: 'uuid' })
  memberUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_user_id' })
  memberUser!: User;

  @Column({
    type: 'enum',
    enum: ResponsibilityType,
  })
  type!: ResponsibilityType;

  /**
   * Free-text label, only meaningful when `type === ResponsibilityType.OTHER`.
   * Normalised to null for every other type in the service layer.
   */
  @Column({ name: 'custom_label', type: 'varchar', length: 120, nullable: true })
  customLabel!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'assigned_by_id', type: 'uuid', nullable: true })
  assignedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_by_id' })
  assignedBy!: User | null;

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