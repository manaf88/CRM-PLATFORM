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

import { Company } from '../../companies/entities/company.entity';
import {
  BrandColorItem,
  BrandLanguage,
  BrandOfferItem,
  BrandServiceItem,
} from '../types/brand-profile.types';

@Entity('brand_profiles')
@Index(['companyId'], { unique: true })
export class BrandProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @OneToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ name: 'brand_name', type: 'varchar', length: 160 })
  brandName!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  industry!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'target_audience', type: 'text', nullable: true })
  targetAudience!: string | null;

  @Column({ name: 'tone_of_voice', type: 'varchar', length: 160, nullable: true })
  toneOfVoice!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  languages!: BrandLanguage[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  colors!: BrandColorItem[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  services!: BrandServiceItem[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  offers!: BrandOfferItem[];

  @Column({ name: 'service_areas', type: 'jsonb', default: () => "'[]'" })
  serviceAreas!: string[];

  @Column({ name: 'cta_preferences', type: 'jsonb', default: () => "'[]'" })
  ctaPreferences!: string[];

  @Column({ name: 'forbidden_words', type: 'jsonb', default: () => "'[]'" })
  forbiddenWords!: string[];

  @Column({ name: 'brand_notes', type: 'text', nullable: true })
  brandNotes!: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}