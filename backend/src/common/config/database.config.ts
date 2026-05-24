import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';

config();

const configService = new ConfigService();

export default new DataSource({
  type: 'postgres',
  host: configService.get('DB_HOST', 'localhost'),
  port: configService.get<number>('DB_PORT', 5432),
  username: configService.get('DB_USERNAME', 'coinbattle'),
  password: configService.get('DB_PASSWORD', 'coinbattle'),
  database: configService.get('DB_NAME', 'coinbattle'),
  entities: [__dirname + '/../../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/../../../migrations/*.{ts,js}'],
  synchronize: false,
  logging: false,
});
