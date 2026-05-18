import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../common/config/redis.config';

const INVITE_TTL_SECONDS = 600;

@Injectable()
export class InviteCodeRedisRepository {
  constructor(private readonly redisService: RedisService) {}

  private inviteKey(code: string): string {
    return `battle:invite:${code}`;
  }

  async save(inviteCode: string, battleId: string): Promise<void> {
    await this.redisService.client.set(this.inviteKey(inviteCode), battleId, 'EX', INVITE_TTL_SECONDS);
  }

  async findBattleId(inviteCode: string): Promise<string | null> {
    return this.redisService.client.get(this.inviteKey(inviteCode));
  }

  async delete(inviteCode: string): Promise<void> {
    await this.redisService.client.del(this.inviteKey(inviteCode));
  }
}
