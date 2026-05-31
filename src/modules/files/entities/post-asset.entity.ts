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
import { FileEntity } from './file.entity';
import { PostAssetType } from '../enums/post-asset-type.enum';

@Entity('post_assets')
@Index(['companyId'])
@Index(['postId'])
@Index(['fileId'])
@Index(['assetType'])
export class PostAsset {
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

  @Column({ name: 'file_id', type: 'uuid' })
  fileId!: string;

  @ManyToOne(() => FileEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file!: FileEntity;

  @Column({
    name: 'asset_type',
    type: 'enum',
    enum: PostAssetType,
  })
  assetType!: PostAssetType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}