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
import { ContentPost } from '../../content/entities/content-post.entity';
import { ContentPostStatus } from '../../content/enums/content-post-status.enum';
import { User } from '../../users/entities/user.entity';
import { PostApprovalAction } from '../enums/post-approval-action.enum';

@Entity('post_approval_logs')
@Index(['companyId'])
@Index(['postId'])
@Index(['action'])
@Index(['createdAt'])
export class PostApprovalLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ name: 'post_id', type: 'uuid' })
  postId!: string;

  @ManyToOne(() => ContentPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post!: ContentPost;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({
    type: 'enum',
    enum: PostApprovalAction,
  })
  action!: PostApprovalAction;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: ContentPostStatus,
    nullable: true,
  })
  fromStatus!: ContentPostStatus | null;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: ContentPostStatus,
    nullable: true,
  })
  toStatus!: ContentPostStatus | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}