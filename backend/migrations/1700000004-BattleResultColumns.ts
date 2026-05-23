import { MigrationInterface, QueryRunner } from 'typeorm';

export class BattleResultColumns1700000004000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE battle_sessions
        ADD COLUMN IF NOT EXISTS final_valuation BIGINT,
        ADD COLUMN IF NOT EXISTS rank INT
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE battle_sessions DROP COLUMN IF EXISTS final_valuation`);
    await queryRunner.query(`ALTER TABLE battle_sessions DROP COLUMN IF EXISTS rank`);
  }
}
