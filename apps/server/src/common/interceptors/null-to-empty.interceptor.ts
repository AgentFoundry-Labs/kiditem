import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';

/**
 * null 응답을 빈 객체로 변환.
 * NestJS가 null을 빈 body(Content-Length: 0)로 직렬화하면
 * 프론트 res.json() 파싱 실패. 이를 방지.
 */
@Injectable()
export class NullToEmptyInterceptor implements NestInterceptor {
  async intercept(_context: ExecutionContext, next: CallHandler): Promise<any> {
    const observable = next.handle();
    return new Promise((resolve) => {
      observable.subscribe({
        next: (data) => resolve(data ?? {}),
        error: (err) => { throw err; },
      });
    });
  }
}
