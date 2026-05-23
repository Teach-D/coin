import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveBattleLeverage1700000006000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE battles DROP COLUMN IF EXISTS leverage`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE battles ADD COLUMN IF NOT EXISTS leverage INT NOT NULL DEFAULT 1`);
  }
}
