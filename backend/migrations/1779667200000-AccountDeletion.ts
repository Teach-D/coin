import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountDeletion1779667200000 implements MigrationInterface {
  name = 'AccountDeletion1779667200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "provider_id" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "provider_id" SET NOT NULL`);
  }
}
