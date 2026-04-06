import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';

/**
 * null 응답을 빈 객체로 변환.
 * NestJS가 null을 빈 body(Content-Length: 0)로 직렬화하면
 * 프론트 res.json() 파싱 실패. 이를 방지.
 */
@Injectable()
export class NullToEmptyInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): any {
    // rxjs 중복 설치(루트 vs 서버) 타입 충돌 우회 — pipe/map 대신 subscribe 래핑
    const source$ = next.handle();
    return {
      subscribe: (observer: any) =>
        source$.subscribe({
          next: (data: any) => observer.next(data ?? {}),
          error: (err: any) => observer.error(err),
          complete: () => observer.complete(),
        }),
    };
  }
}
