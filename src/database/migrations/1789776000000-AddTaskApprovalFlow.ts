import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Give IN_REVIEW an owner.
 *
 * A task gains an approver, the moment it was handed over, the moment it was
 * reviewed and the reviewer's last note. Responsibility areas gain a stable
 * key, so "who approves design for this client" can be looked up without
 * depending on how each client spelled the area's name.
 *
 * Written by hand and defensively — every statement is safe to run twice — so
 * that it behaves the same on a database built by `synchronize` in development
 * and on the production database.
 *
 * Existing IN_REVIEW tasks are deliberately left without an approver rather
 * than backfilled from the matrix: nobody agreed to approve work that was
 * submitted before there was anything to agree to. They surface in the
 * frontend as "needs an approver".
 */
export class AddTaskApprovalFlow1789776000000 implements MigrationInterface {
  name = 'AddTaskApprovalFlow1789776000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tasks"
      ADD COLUMN IF NOT EXISTS "approver_id" uuid,
      ADD COLUMN IF NOT EXISTS "submitted_for_review_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "review_note" text
    `);

    // The approver keeps their tasks' history when their account goes away,
    // exactly like the assignee does.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid
           AND a.attnum = ANY (c.conkey)
          WHERE c.conrelid = 'tasks'::regclass
            AND c.contype = 'f'
            AND a.attname = 'approver_id'
        ) THEN
          ALTER TABLE "tasks"
          ADD CONSTRAINT "FK_tasks_approver_id"
          FOREIGN KEY ("approver_id") REFERENCES "users" ("id")
          ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    // "What is waiting on me" and the dashboard's per-approver breakdown.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tasks_approver_id"
      ON "tasks" ("approver_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tasks_company_status_approver"
      ON "tasks" ("company_id", "status", "approver_id")
    `);

    // Areas are named freely per client — "Design", "Creative", «تصميم» — so a
    // task type cannot be matched to one by name alone. The key is what the
    // matching actually runs on; the name stays whatever the client calls it.
    await queryRunner.query(`
      ALTER TABLE "responsibility_areas"
      ADD COLUMN IF NOT EXISTS "area_key" character varying(60)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_responsibility_areas_company_key"
      ON "responsibility_areas" ("company_id", "area_key")
      WHERE "area_key" IS NOT NULL
    `);

    // New enum values. These run as plain statements on purpose: Postgres
    // refuses ALTER TYPE ... ADD VALUE inside a function or DO block.
    const activityActions = [
      'TASK_SUBMITTED_FOR_REVIEW',
      'TASK_APPROVED',
      'TASK_CHANGES_REQUESTED',
      'TASK_APPROVER_CHANGED',
    ];

    for (const action of activityActions) {
      await queryRunner.query(`
        ALTER TYPE "task_activity_logs_action_enum"
        ADD VALUE IF NOT EXISTS '${action}'
      `);
    }

    const notificationTypes = [
      'TASK_SUBMITTED_FOR_REVIEW',
      'TASK_APPROVED',
      'TASK_CHANGES_REQUESTED',
    ];

    for (const type of notificationTypes) {
      await queryRunner.query(`
        ALTER TYPE "notifications_type_enum"
        ADD VALUE IF NOT EXISTS '${type}'
      `);
    }
  }

  /**
   * The added enum values are not removed: dropping a value from a Postgres
   * enum means rebuilding the type and every column that uses it, and rows
   * written while the feature was live would have nowhere to go. They are
   * harmless if unused.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_responsibility_areas_company_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "responsibility_areas" DROP COLUMN IF EXISTS "area_key"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_tasks_company_status_approver"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_tasks_approver_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "FK_tasks_approver_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "tasks"
      DROP COLUMN IF EXISTS "review_note",
      DROP COLUMN IF EXISTS "reviewed_at",
      DROP COLUMN IF EXISTS "submitted_for_review_at",
      DROP COLUMN IF EXISTS "approver_id"
    `);
  }
}
