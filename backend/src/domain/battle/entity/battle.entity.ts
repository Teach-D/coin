import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { CoinBattleException } from '../../../common/exception/coin-battle.exception';
import { ErrorCode } from '../../../common/exception/error-code.enum';

export enum BattleStatus {
  WAITING = 'WAITING',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
}

@Entity('battles')
export class Battle {
  @PrimaryColumn({ name: 'battle_id', type: 'uuid' })
  battleId: string;

  @Column({ name: 'host_user_id', type: 'bigint', nullable: false })
  hostUserId: number;

  @Column({ name: 'user_id', type: 'bigint', nullable: false })
  userId: number;

  @Column({ type: 'varchar', length: 20, nullable: false, default: BattleStatus.WAITING })
  status: BattleStatus;

  @Column({ name: 'start_time', type: 'timestamptz', nullable: true })
  startTime: Date | null;

  @Column({ name: 'end_time', type: 'timestamptz', nullable: true })
  endTime: Date | null;

  @Column({ name: 'seed_money', type: 'bigint', nullable: false, default: 10_000_000 })
  seedMoney: number;

  @Column({ type: 'int', nullable: false, default: 10 })
  duration: number;

  @Column({ name: 'max_participants', type: 'int', nullable: false, default: 2 })
  maxParticipants: number;

  @Column({ name: 'current_participants', type: 'int', nullable: false, default: 0 })
  currentParticipants: number;

  @Column({ name: 'winner_id', type: 'bigint', nullable: true })
  winnerId: number | null;

  @VersionColumn({ default: 0 })
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  canAddParticipant(): boolean {
    return this.status === BattleStatus.WAITING && this.currentParticipants < this.maxParticipants;
  }

  canStart(): boolean {
    return this.status === BattleStatus.WAITING && this.currentParticipants >= this.maxParticipants;
  }

  start(): void {
    this.status = BattleStatus.IN_PROGRESS;
    this.startTime = new Date();
    this.endTime = new Date(Date.now() + this.duration * 60 * 1000);
  }

  finish(winnerId: number | null = null): void {
    this.status = BattleStatus.FINISHED;
    this.endTime = new Date();
    this.winnerId = winnerId;
  }

  addParticipant(): void {
    this.currentParticipants++;
  }

  canGenerateInvite(): boolean {
    return this.status === BattleStatus.IN_PROGRESS;
  }

  addLateParticipant(): void {
    if (this.status !== BattleStatus.IN_PROGRESS) {
      throw new CoinBattleException(ErrorCode.BATTLE_NOT_IN_PROGRESS);
    }
    if (this.currentParticipants >= this.maxParticipants) {
      throw new CoinBattleException(ErrorCode.BATTLE_FULL);
    }
    this.currentParticipants++;
  }
}
