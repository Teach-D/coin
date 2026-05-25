import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserWithdrawnEvent } from '../event/user-withdrawn.event';

@Injectable()
export class UserWithdrawnListener {
  private readonly logger = new Logger(UserWithdrawnListener.name);

  @OnEvent('user.withdrawn')
  handle(event: UserWithdrawnEvent): void {
    if (event.voidedBattleIds.length > 0 || event.deletedBattleIds.length > 0) {
      this.logger.log(
        `User ${event.userId} withdrawn — voided battles: [${event.voidedBattleIds}], deleted battles: [${event.deletedBattleIds}]`,
      );
    }
  }
}
