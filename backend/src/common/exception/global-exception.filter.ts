import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CoinBattleException } from './coin-battle.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (response.headersSent) return;

    if (exception instanceof CoinBattleException) {
      return response.status(exception.getStatus()).json(exception.getResponse());
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status === HttpStatus.BAD_REQUEST && typeof exceptionResponse === 'object') {
        const res = exceptionResponse as any;
        const message =
          Array.isArray(res.message) ? res.message[0] : (res.message ?? '유효하지 않은 요청입니다');
        return response.status(status).json({ success: false, data: null, message });
      }

      return response.status(status).json({
        success: false,
        data: null,
        message:
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : (exceptionResponse as any).message ?? '요청 처리에 실패했습니다',
      });
    }

    this.logger.error(`Unhandled exception on ${request.method} ${request.url}`, exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      data: null,
      message: '서버 내부 오류가 발생했습니다',
    });
  }
}
