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
import { Report } from './report.entity';

/**
 * A public link to one report.
 *
 * Only the hash of the token is kept, so the row is worthless to anybody who
 * reads the database. It doubles as the audit trail for sharing: who opened
 * the link up, and who closed it again.
 */
@Entity('report_share_tokens')
@Index(['tokenHash'], { unique: true })
@Index(['reportId'])
@Index(['companyId'])
export class ReportShareToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ name: 'report_id', type: 'uuid' })
  reportId!: string;

  @ManyToOne(() => Report, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report!: Report;

  @Column({ name: 'token_hash', type: 'varchar', length: 128 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;

  @Column({ name: 'revoked_by_id', type: 'uuid', nullable: true })
  revokedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'revoked_by_id' })
  revokedBy!: User | null;

  @Column({ name: 'last_viewed_at', type: 'timestamptz', nullable: true })
  lastViewedAt!: Date | null;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
