/**
 * 스펙용 — `jsdom` 패키지의 타입 없는 최소 선언. 몰 쓰기 전용 처리기 스펙(옛 node 스펙의 가짜 화면을 옮긴 것)이 문서마다 주소가
 * 다른 창을 새로 만든다(Vitest `jsdom` 환경은 파일마다 창 하나다). 확장 tsconfig에는 DOM 타입이 없어 창은 느슨하게 본다.
 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    readonly window: any;
  }
}
