import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1700000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id                BIGSERIAL PRIMARY KEY,
        email             VARCHAR(500) NOT NULL UNIQUE,
        nickname          VARCHAR(50)  NOT NULL UNIQUE,
        profile_image_url VARCHAR(500),
        provider          VARCHAR(20)  NOT NULL,
        provider_id       VARCHAR(255) NOT NULL,
        role              VARCHAR(20)  NOT NULL DEFAULT 'ROLE_USER',
        balance           BIGINT       NOT NULL DEFAULT 10000000,
        version           INT          NOT NULL DEFAULT 0,
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_provider_provider_id UNIQUE (provider, provider_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_users_provider ON users (provider, provider_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_provider`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
