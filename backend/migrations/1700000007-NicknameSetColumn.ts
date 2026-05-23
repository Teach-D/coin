import { MigrationInterface, QueryRunner } from 'typeorm';

export class NicknameSetColumn1700000007 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname_set BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await queryRunner.query(
      `UPDATE users SET nickname_set = TRUE WHERE nickname_set = FALSE`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS nickname_set`);
  }
}
