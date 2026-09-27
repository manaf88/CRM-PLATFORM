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
import { FileEntity } from '../../files/entities/file.entity';
import { User } from '../../users/entities/user.entity';
import { AttachmentEntityType } from '../enums/attachment-entity-type.enum';

/**
 * One file hung off one record — a task, a post, a campaign, a lead or the
 * brand profile.
 *
 * Polymorphic on purpose: five tables with the same four columns would mean
 * five services, five controllers and five sets of rules that drift. The
 * parent is checked in the service, which is also where the tenant guard is.
 */
@Entity('entity_attachments')
@Index(['companyId'])
@Index(['entityType', 'entityId'])
@Index(['fileId'])
@Index(['entityType', 'entityId', 'fileId'], { unique: true })
export class EntityAttachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({
    name: 'entity_type',
    type: 'enum',
    enum: AttachmentEntityType,
  })
  entityType!: AttachmentEntityType;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ name: 'file_id', type: 'uuid' })
  fileId!: string;

  @ManyToOne(() => FileEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file!: FileEntity;

  /** Who attached it — the delete rule is built on this. */
  @Column({ name: 'uploaded_by_id', type: 'uuid', nullable: true })
  uploadedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy!: User | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  label!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
