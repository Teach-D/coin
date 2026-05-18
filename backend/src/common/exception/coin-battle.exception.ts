import { HttpException } from '@nestjs/common';
import { ErrorCode, ERROR_CODE_MESSAGE, ERROR_CODE_STATUS } from './error-code.enum';

export class CoinBattleException extends HttpException {
  readonly errorCode: ErrorCode;

  constructor(errorCode: ErrorCode) {
    super(
      {
        success: false,
        data: null,
        message: ERROR_CODE_MESSAGE[errorCode],
        errorCode,
      },
      ERROR_CODE_STATUS[errorCode],
    );
    this.errorCode = errorCode;
  }
}
