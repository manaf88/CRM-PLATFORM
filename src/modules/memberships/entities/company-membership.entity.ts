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
import { CompanyMembershipRole } from '../enums/company-membership-role.enum';
import { CompanyMembershipStatus } from '../enums/company-membership-status.enum';

@Entity('company_memberships')
@Index(['companyId', 'userId'], { unique: true })
@Index(['userId'])
@Index(['companyId'])
@Index(['role'])
export class CompanyMembership {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: CompanyMembershipRole,
  })
  role!: CompanyMembershipRole;

  @Column({
    type: 'enum',
    enum: CompanyMembershipStatus,
    default: CompanyMembershipStatus.ACTIVE,
  })
  status!: CompanyMembershipStatus;

  @Column({ name: 'invited_by_id', type: 'uuid', nullable: true })
  invitedById!: string | null;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}