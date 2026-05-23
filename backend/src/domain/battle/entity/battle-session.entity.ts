import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('battle_sessions')
export class BattleSession {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'battle_id', type: 'uuid', nullable: false })
  battleId: string;

  @Column({ name: 'participant_id', type: 'bigint', nullable: false })
  participantId: number;

  @Column({ name: 'battle_balance', type: 'bigint', nullable: false, default: 0 })
  battleBalance: number;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;

  @Column({ name: 'final_valuation', type: 'bigint', nullable: true })
  finalValuation: number | null;

  @Column({ type: 'int', nullable: true })
  rank: number | null;
}
