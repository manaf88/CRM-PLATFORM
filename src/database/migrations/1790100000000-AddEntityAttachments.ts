import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One attachments table for every record that can carry a file.
 *
 * The rows already in `task_attachments` are copied across; the old table is
 * left in place, unread, so this release can be rolled back without losing
 * anything. Dropping it is a later migration, once nothing reads it.
 *
 * `post_assets` is deliberately not migrated: an asset is the deliverable,
 * an attachment is reference material, and merging them would lose that.
 */
export class AddEntityAttachments1790100000000 implements MigrationInterface {
  name = 'AddEntityAttachments1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type
          WHERE typname = 'entity_attachments_entity_type_enum'
        ) THEN
          CREATE TYPE "entity_attachments_entity_type_enum" AS ENUM (
            'TASK', 'POST', 'CAMPAIGN', 'LEAD', 'BRAND_PROFILE'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "entity_attachments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "entity_type" "entity_attachments_entity_type_enum" NOT NULL,
        "entity_id" uuid NOT NULL,
        "file_id" uuid NOT NULL,
        "uploaded_by_id" uuid,
        "label" character varying(180),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_entity_attachments" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_entity_attachments_entity_file"
      ON "entity_attachments" ("entity_type", "entity_id", "file_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_entity_attachments_entity"
      ON "entity_attachments" ("entity_type", "entity_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_entity_attachments_company"
      ON "entity_attachments" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_entity_attachments_file"
      ON "entity_attachments" ("file_id")
    `);

    await this.addForeignKey(
      queryRunner,
      'company_id',
      'FK_entity_attachments_company',
      'companies',
      'CASCADE',
    );
    await this.addForeignKey(
      queryRunner,
      'file_id',
      'FK_entity_attachments_file',
      'files',
      'CASCADE',
    );
    await this.addForeignKey(
      queryRunner,
      'uploaded_by_id',
      'FK_entity_attachments_uploaded_by',
      'users',
      'SET NULL',
    );

    // The old rows carry no uploader of their own, so the person who put the
    // file in the bucket is treated as the person who attached it.
    await queryRunner.query(`
      INSERT INTO "entity_attachments"
        ("company_id", "entity_type", "entity_id", "file_id", "uploaded_by_id", "created_at")
      SELECT
        ta."company_id",
        'TASK'::"entity_attachments_entity_type_enum",
        ta."task_id",
        ta."file_id",
        f."uploaded_by_id",
        ta."created_at"
      FROM "task_attachments" ta
      LEFT JOIN "files" f ON f."id" = ta."file_id"
      ON CONFLICT ("entity_type", "entity_id", "file_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "entity_attachments"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "entity_attachments_entity_type_enum"`,
    );
  }

  private async addForeignKey(
    queryRunner: QueryRunner,
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
          WHERE c.conrelid = 'entity_attachments'::regclass
            AND c.contype = 'f'
            AND a.attname = '${column}'
        ) THEN
          ALTER TABLE "entity_attachments"
          ADD CONSTRAINT "${constraintName}"
          FOREIGN KEY ("${column}") REFERENCES "${referencedTable}" ("id")
          ON DELETE ${onDelete};
        END IF;
      END
      $$;
    `);
  }
}
