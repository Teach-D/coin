export class UserWithdrawnEvent {
  constructor(
    readonly userId: number,
    readonly voidedBattleIds: string[],
    readonly deletedBattleIds: string[],
  ) {}
}
