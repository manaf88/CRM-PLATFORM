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

  /**
   * Primary role. Kept in step with `roles[0]` so that anything still reading a
   * single role — and a rollback to the previous release — keeps working.
   * New code should read `effectiveRoles`.
   */
  @Column({
    type: 'enum',
    enum: CompanyMembershipRole,
  })
  role!: CompanyMembershipRole;

  /**
   * Every role this person holds on this client. Somebody can be both the
   * Designer and the Copywriter on one client without needing two memberships,
   * which would duplicate them in every listing and break the unique index.
   */
  @Column({
    type: 'enum',
    enum: CompanyMembershipRole,
    enumName: 'company_memberships_role_enum',
    array: true,
    default: () => "'{}'",
  })
  roles!: CompanyMembershipRole[];

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

  /**
   * The roles to enforce against. Falls back to the single `role` for any row
   * written before multi-role support, so a half-migrated table still behaves.
   */
  get effectiveRoles(): CompanyMembershipRole[] {
    if (this.roles?.length) {
      return this.roles;
    }

    return this.role ? [this.role] : [];
  }
}
