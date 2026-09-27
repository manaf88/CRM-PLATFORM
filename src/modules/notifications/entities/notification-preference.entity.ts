import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { NotificationType } from '../enums/notification-type.enum';

/**
 * What a person does not want to hear about.
 *
 * One row per user, created on first save — a user who has never touched the
 * settings has no row and gets the defaults, rather than every account
 * carrying a row that says "nothing muted".
 */
@Entity('notification_preferences')
@Index(['userId'], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /**
   * Notification types the bell and the digest both skip. Stored as plain
   * text rather than the enum type so that muting a type, and later removing
   * that type from the code, cannot break the column.
   */
  @Column({
    name: 'muted_types',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  mutedTypes!: NotificationType[];

  @Column({ name: 'email_digest', type: 'boolean', default: true })
  emailDigest!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
