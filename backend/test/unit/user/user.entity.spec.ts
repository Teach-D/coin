/**
 * Red 테스트 — User.withdraw(), User.isWithdrawn(), User.deletedAt 구현 전 실패
 *
 * 구현 대상:
 *   - User.deletedAt: Date | null  (컬럼 추가)
 *   - User.withdraw(): void         (도메인 메서드)
 *   - User.isWithdrawn(): boolean   (헬퍼 메서드)
 *
 * 구현 파일: src/domain/user/entity/user.entity.ts
 */
import { User, AuthProvider, UserRole } from 'src/domain/user/entity/user.entity';

type WithdrawnUser = User & {
  deletedAt: Date | null;
  withdraw(): void;
  isWithdrawn(): boolean;
};

function makeUser(overrides: Partial<User> = {}): WithdrawnUser {
  const user = new User() as WithdrawnUser;
  user.id = overrides.id ?? 1;
  user.email = overrides.email !== undefined ? overrides.email : 'test@example.com';
  user.nickname = overrides.nickname ?? 'tester';
  user.nicknameSet = overrides.nicknameSet ?? false;
  user.profileImageUrl = overrides.profileImageUrl !== undefined ? overrides.profileImageUrl : 'https://example.com/image.jpg';
  user.provider = overrides.provider ?? AuthProvider.GOOGLE;
  user.providerId = overrides.providerId ?? 'google-123';
  user.role = overrides.role ?? UserRole.ROLE_USER;
  user.balance = overrides.balance ?? 10_000_000;
  user.version = overrides.version ?? 0;
  return user;
}

describe('User entity — withdraw/isWithdrawn (미구현)', () => {
  describe('withdraw()', () => {
    it('withdraw_호출_후_email_null_처리', () => {
      const user = makeUser({ email: 'test@example.com' });

      user.withdraw();

      expect(user.email).toBeNull();
    });

    it('withdraw_호출_후_profileImageUrl_null_처리', () => {
      const user = makeUser({ profileImageUrl: 'https://example.com/image.jpg' });

      user.withdraw();

      expect(user.profileImageUrl).toBeNull();
    });

    it('withdraw_호출_후_providerId_null_처리', () => {
      const user = makeUser({ providerId: 'google-abc-123' });

      user.withdraw();

      expect((user as any).providerId).toBeNull();
    });

    it('withdraw_호출_후_nickname_탈퇴한_사용자_id_포함_변경', () => {
      const user = makeUser({ id: 1, nickname: 'original_nickname' });

      user.withdraw();

      expect(user.nickname).toBe('(탈퇴한 사용자)-1');
    });

    it('withdraw_호출_후_deletedAt_현재_시각_기록', () => {
      const user = makeUser();
      const before = new Date();

      user.withdraw();

      const after = new Date();
      expect(user.deletedAt).not.toBeNull();
      expect(user.deletedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(user.deletedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('이미_탈퇴한_사용자에게_withdraw_재호출해도_deletedAt_갱신됨', () => {
      const user = makeUser();
      user.withdraw();
      const firstDeletedAt = user.deletedAt;

      user.withdraw();

      expect(user.deletedAt).not.toBeNull();
      expect(user.deletedAt!.getTime()).toBeGreaterThanOrEqual(firstDeletedAt!.getTime());
    });
  });

  describe('isWithdrawn()', () => {
    it('deletedAt_null이면_isWithdrawn_false_반환', () => {
      const user = makeUser();

      expect(user.isWithdrawn()).toBe(false);
    });

    it('withdraw_호출_후_isWithdrawn_true_반환', () => {
      const user = makeUser();
      user.withdraw();

      expect(user.isWithdrawn()).toBe(true);
    });

    it('withdraw_전_profileImageUrl_유지되고_withdraw_후_null_처리', () => {
      const user = makeUser({ profileImageUrl: 'https://cdn.example.com/avatar.jpg' });
      expect(user.profileImageUrl).not.toBeNull();

      user.withdraw();

      expect(user.profileImageUrl).toBeNull();
      expect(user.isWithdrawn()).toBe(true);
    });

    it('deletedAt_컬럼_타입_Date_반환', () => {
      const user = makeUser();
      user.withdraw();

      expect(user.deletedAt).toBeInstanceOf(Date);
    });
  });
});
