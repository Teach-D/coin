import { MigrationInterface, QueryRunner } from 'typeorm';

export class BattleIsolatedFunds1700000005 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE battle_sessions ADD COLUMN IF NOT EXISTS battle_balance BIGINT NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE positions ADD COLUMN IF NOT EXISTS battle_id UUID NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_positions_user_battle ON positions (user_id, battle_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_positions_user_battle`);
    await queryRunner.query(`ALTER TABLE positions DROP COLUMN IF EXISTS battle_id`);
    await queryRunner.query(`ALTER TABLE battle_sessions DROP COLUMN IF EXISTS battle_balance`);
  }
}
