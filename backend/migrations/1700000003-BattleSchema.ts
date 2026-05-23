import { MigrationInterface, QueryRunner } from 'typeorm';

export class BattleSchema1700000003000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE battles (
        battle_id            UUID PRIMARY KEY,
        host_user_id         BIGINT      NOT NULL,
        user_id              BIGINT      NOT NULL,
        status               VARCHAR(20) NOT NULL DEFAULT 'WAITING',
        start_time           TIMESTAMPTZ,
        end_time             TIMESTAMPTZ,
        leverage             INT         NOT NULL,
        seed_money           BIGINT      NOT NULL,
        duration             INT         NOT NULL DEFAULT 10,
        max_participants     INT         NOT NULL DEFAULT 2,
        current_participants INT         NOT NULL DEFAULT 0,
        winner_id            BIGINT,
        version              INT         NOT NULL DEFAULT 0,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE battle_sessions (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        battle_id       UUID        NOT NULL REFERENCES battles(battle_id) ON DELETE CASCADE,
        participant_id  BIGINT      NOT NULL,
        joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(battle_id, participant_id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_battles_status ON battles(status)`);
    await queryRunner.query(`CREATE INDEX idx_battles_host_user_id ON battles(host_user_id)`);
    await queryRunner.query(`CREATE INDEX idx_battles_created_at ON battles(created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_battle_sessions_battle_id ON battle_sessions(battle_id)`);
    await queryRunner.query(`CREATE INDEX idx_battle_sessions_participant_id ON battle_sessions(participant_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_battle_sessions_participant_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_battle_sessions_battle_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_battles_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_battles_host_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_battles_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS battle_sessions`);
    await queryRunner.query(`DROP TABLE IF EXISTS battles`);
  }
}
