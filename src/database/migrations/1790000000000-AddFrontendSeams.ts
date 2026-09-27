import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The backend half of the frontend seams: notification preferences, password
 * reset, public report links, lead outcomes, and stage numbers on tasks.
 *
 * Hand-written and idempotent, like the others here — every statement is safe
 * to run twice, so it behaves the same on a database built by `synchronize` in
 * development and on production, which applies these at boot.
 */
export class AddFrontendSeams1790000000000 implements MigrationInterface {
  name = 'AddFrontendSeams1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM's own schema sync relies on this for uuid defaults; creating it
    // here keeps a migration-only database in step with a synchronised one.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ---------------------------------------------- notification preferences
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_preferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "muted_types" text[] NOT NULL DEFAULT '{}',
        "email_digest" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_preferences" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notification_preferences_user"
      ON "notification_preferences" ("user_id")
    `);

    await this.addForeignKey(
      queryRunner,
      'notification_preferences',
      'user_id',
      'FK_notification_preferences_user',
      'users',
      'CASCADE',
    );

    // ------------------------------------------------- password reset tokens
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(128) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_password_reset_tokens_hash"
      ON "password_reset_tokens" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_password_reset_tokens_user"
      ON "password_reset_tokens" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_password_reset_tokens_expires"
      ON "password_reset_tokens" ("expires_at")
    `);

    await this.addForeignKey(
      queryRunner,
      'password_reset_tokens',
      'user_id',
      'FK_password_reset_tokens_user',
      'users',
      'CASCADE',
    );

    // -------------------------------------------------- report share tokens
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_share_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "report_id" uuid NOT NULL,
        "token_hash" character varying(128) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_by_id" uuid,
        "revoked_by_id" uuid,
        "last_viewed_at" TIMESTAMP WITH TIME ZONE,
        "view_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_share_tokens" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_report_share_tokens_hash"
      ON "report_share_tokens" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_report_share_tokens_report"
      ON "report_share_tokens" ("report_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_report_share_tokens_company"
      ON "report_share_tokens" ("company_id")
    `);

    await this.addForeignKey(
      queryRunner,
      'report_share_tokens',
      'company_id',
      'FK_report_share_tokens_company',
      'companies',
      'CASCADE',
    );
    await this.addForeignKey(
      queryRunner,
      'report_share_tokens',
      'report_id',
      'FK_report_share_tokens_report',
      'reports',
      'CASCADE',
    );
    await this.addForeignKey(
      queryRunner,
      'report_share_tokens',
      'created_by_id',
      'FK_report_share_tokens_created_by',
      'users',
      'SET NULL',
    );
    await this.addForeignKey(
      queryRunner,
      'report_share_tokens',
      'revoked_by_id',
      'FK_report_share_tokens_revoked_by',
      'users',
      'SET NULL',
    );

    // ------------------------------------------------------- lead outcomes
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'leads_lost_reason_enum'
        ) THEN
          CREATE TYPE "leads_lost_reason_enum" AS ENUM (
            'PRICE', 'TIMING', 'WENT_ELSEWHERE',
            'NO_RESPONSE', 'NOT_A_FIT', 'OTHER'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "leads"
      ADD COLUMN IF NOT EXISTS "lost_reason" "leads_lost_reason_enum",
      ADD COLUMN IF NOT EXISTS "deal_value" numeric(12,2)
    `);

    // -------------------------------------------------- task stage numbers
    await queryRunner.query(`
      ALTER TABLE "tasks"
      ADD COLUMN IF NOT EXISTS "sequence" integer
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tasks_related_entity_sequence"
      ON "tasks" ("related_entity_id", "sequence")
    `);

    // One task per stage per post. Enforced here as well as in the service:
    // "the previous stage" has no meaning if two tasks claim to be it.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tasks_post_sequence"
      ON "tasks" ("related_entity_id", "sequence")
      WHERE "sequence" IS NOT NULL AND "related_entity_type" = 'POST'
    `);

    // ------------------------------------------------- new enum values
    // Plain statements: Postgres refuses ALTER TYPE ... ADD VALUE inside a
    // function or DO block.
    for (const type of ['REVIEW_WAITING_24H', 'REVIEW_WAITING_48H']) {
      await queryRunner.query(`
        ALTER TYPE "notifications_type_enum"
        ADD VALUE IF NOT EXISTS '${type}'
      `);
    }
  }

  /**
   * Added enum values are not removed: dropping one means rebuilding the type
   * and every column that uses it, and rows written while the feature was live
   * would have nowhere to go.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_tasks_post_sequence"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_tasks_related_entity_sequence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "sequence"`,
    );
    await queryRunner.query(`
      ALTER TABLE "leads"
      DROP COLUMN IF EXISTS "deal_value",
      DROP COLUMN IF EXISTS "lost_reason"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "leads_lost_reason_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "report_share_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "password_reset_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_preferences"`);
  }

  /** Adds a foreign key only when that column does not already have one. */
  private async addForeignKey(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    constraintName: string,
    referencedTable: string,
    onDelete: 'CASCADE' | 'SET NULL',
  ): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid
           AND a.attnum = ANY (c.conkey)
          WHERE c.conrelid = '${table}'::regclass
            AND c.contype = 'f'
            AND a.attname = '${column}'
        ) THEN
          ALTER TABLE "${table}"
          ADD CONSTRAINT "${constraintName}"
          FOREIGN KEY ("${column}") REFERENCES "${referencedTable}" ("id")
          ON DELETE ${onDelete};
        END IF;
      END
      $$;
    `);
  }
}
