import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Let a person hold several roles on one client.
 *
 * Adds `roles` alongside the existing `role` rather than replacing it: the old
 * column stays in step as the primary role, so rolling the release back does
 * not lose anything and nothing that still reads a single role breaks.
 * Dropping `role` is a later migration, once nothing reads it.
 *
 * Written by hand and defensively — every statement is safe to run twice — so
 * that it behaves the same on a database built by `synchronize` in development
 * and on the production database, which was never migrated before.
 */
export class AddMembershipRoles1756900000000 implements MigrationInterface {
  name = 'AddMembershipRoles1756900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Reuses the enum type the `role` column already uses, so the two can
    // never drift apart when a new role is added.
    await queryRunner.query(`
      ALTER TABLE "company_memberships"
      ADD COLUMN IF NOT EXISTS "roles" "company_memberships_role_enum"[]
      NOT NULL DEFAULT '{}'
    `);

    // Everyone keeps exactly the role they have today, as a one-item list.
    await queryRunner.query(`
      UPDATE "company_memberships"
      SET "roles" = ARRAY["role"]
      WHERE cardinality("roles") = 0
    `);

    // Overlap lookups ("who on this client is a Designer?") hit this.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_company_memberships_roles"
      ON "company_memberships" USING GIN ("roles")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_company_memberships_roles"
    `);
    await queryRunner.query(`
      ALTER TABLE "company_memberships" DROP COLUMN IF EXISTS "roles"
    `);
  }
}
