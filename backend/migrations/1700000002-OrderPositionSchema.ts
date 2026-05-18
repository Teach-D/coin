import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderPositionSchema1700000002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE positions (
        id               BIGSERIAL PRIMARY KEY,
        user_id          BIGINT          NOT NULL REFERENCES users(id),
        ticker           VARCHAR(30)     NOT NULL,
        direction        VARCHAR(10)     NOT NULL,
        quantity         NUMERIC(30, 10) NOT NULL,
        average_price    BIGINT          NOT NULL,
        leverage         INT             NOT NULL DEFAULT 1,
        margin           BIGINT          NOT NULL,
        status           VARCHAR(20)     NOT NULL DEFAULT 'OPEN',
        version          INT             NOT NULL DEFAULT 0,
        opened_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
        closed_at        TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_positions_user_status ON positions (user_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_positions_user_ticker_status ON positions (user_id, ticker, status)`);

    await queryRunner.query(`
      CREATE TABLE orders (
        id               BIGSERIAL PRIMARY KEY,
        user_id          BIGINT          NOT NULL REFERENCES users(id),
        position_id      BIGINT          REFERENCES positions(id),
        idempotency_key  VARCHAR(64)     NOT NULL UNIQUE,
        ticker           VARCHAR(30)     NOT NULL,
        order_type       VARCHAR(10)     NOT NULL,
        direction        VARCHAR(10)     NOT NULL,
        side             VARCHAR(10)     NOT NULL,
        requested_amount BIGINT,
        limit_price      BIGINT,
        executed_price   BIGINT,
        executed_amount  BIGINT,
        executed_quantity NUMERIC(30, 10),
        leverage         INT             NOT NULL DEFAULT 1,
        close_ratio      NUMERIC(5, 4),
        realized_pnl     BIGINT,
        status           VARCHAR(20)     NOT NULL DEFAULT 'PENDING',
        created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_orders_idempotency ON orders (idempotency_key)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_orders_idempotency`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_orders_user_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS orders`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_positions_user_ticker_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_positions_user_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS positions`);
  }
}
