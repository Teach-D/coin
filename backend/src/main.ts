import 'reflect-metadata';
import { types } from 'pg';
types.setTypeParser(20, (val: string) => parseInt(val, 10));
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/exception/global-exception.filter';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = process.env.PORT ?? 8080;
  await app.listen(port);
  console.log(`CoinBattle backend listening on port ${port}`);
}

bootstrap();
