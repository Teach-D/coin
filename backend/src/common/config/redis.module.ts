import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.config';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
