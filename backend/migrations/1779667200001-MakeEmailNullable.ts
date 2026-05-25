import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeEmailNullable1779667200001 implements MigrationInterface {
  name = 'MakeEmailNullable1779667200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL`);
  }
}
