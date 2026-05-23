// BATTLE_NOT_HOST 에러코드는 error-code.enum.ts에 아직 없음 — 구현 시 추가 필요
// Battle.assertCanDelete() 메서드는 아직 구현되지 않음 — 이 테스트는 Red 상태입니다
import { Battle, BattleStatus } from 'src/domain/battle/entity/battle.entity';
import { CoinBattleException } from 'src/common/exception/coin-battle.exception';
import { ErrorCode } from 'src/common/exception/error-code.enum';

// 구현 예정 에러코드 상수 (ErrorCode enum에 추가 필요)
const BATTLE_NOT_HOST = 'BATTLE_NOT_HOST' as unknown as ErrorCode;

function makeBattle(overrides: Partial<Battle> = {}): Battle {
  const battle = new Battle();
  battle.battleId = overrides.battleId ?? 'battle-uuid-1';
  battle.hostUserId = overrides.hostUserId ?? 1;
  battle.userId = overrides.userId ?? 1;
  battle.status = overrides.status ?? BattleStatus.WAITING;
  battle.seedMoney = overrides.seedMoney ?? 1_000_000;
  battle.duration = overrides.duration ?? 10;
  battle.maxParticipants = overrides.maxParticipants ?? 2;
  battle.currentParticipants = overrides.currentParticipants ?? 1;
  battle.winnerId = overrides.winnerId ?? null;
  battle.startTime = overrides.startTime ?? null;
  battle.endTime = overrides.endTime ?? null;
  battle.version = overrides.version ?? 0;
  battle.createdAt = overrides.createdAt ?? new Date();
  battle.updatedAt = overrides.updatedAt ?? new Date();
  return battle;
}

describe('Battle Entity', () => {
  describe('assertCanDelete()', () => {
    it('방장_본인이_WAITING_상태_배틀에서_호출_시_예외_없이_통과', () => {
      const hostUserId = 1;
      const battle = makeBattle({ hostUserId, status: BattleStatus.WAITING });

      // assertCanDelete는 아직 구현되지 않아 TypeError가 발생함 — Red 상태
      expect(() => (battle as any).assertCanDelete(hostUserId)).not.toThrow();
    });

    it('방장이_아닌_유저가_호출_시_BATTLE_NOT_HOST_예외_throw', () => {
      const hostUserId = 1;
      const nonHostUserId = 2;
      const battle = makeBattle({ hostUserId, status: BattleStatus.WAITING });

      // assertCanDelete는 아직 구현되지 않아 TypeError가 발생함 — Red 상태
      expect(() => (battle as any).assertCanDelete(nonHostUserId)).toThrow(CoinBattleException);
      try {
        (battle as any).assertCanDelete(nonHostUserId);
      } catch (e) {
        expect((e as CoinBattleException).errorCode).toBe(BATTLE_NOT_HOST);
      }
    });

    it('방장이더라도_IN_PROGRESS_상태_배틀에서_호출_시_BATTLE_ALREADY_STARTED_예외_throw', () => {
      const hostUserId = 1;
      const battle = makeBattle({ hostUserId, status: BattleStatus.IN_PROGRESS });

      expect(() => (battle as any).assertCanDelete(hostUserId)).toThrow(CoinBattleException);
      try {
        (battle as any).assertCanDelete(hostUserId);
      } catch (e) {
        expect((e as CoinBattleException).errorCode).toBe(ErrorCode.BATTLE_ALREADY_STARTED);
      }
    });

    it('방장이더라도_FINISHED_상태_배틀에서_호출_시_BATTLE_ALREADY_STARTED_예외_throw', () => {
      const hostUserId = 1;
      const battle = makeBattle({ hostUserId, status: BattleStatus.FINISHED });

      expect(() => (battle as any).assertCanDelete(hostUserId)).toThrow(CoinBattleException);
      try {
        (battle as any).assertCanDelete(hostUserId);
      } catch (e) {
        expect((e as CoinBattleException).errorCode).toBe(ErrorCode.BATTLE_ALREADY_STARTED);
      }
    });
  });
});
