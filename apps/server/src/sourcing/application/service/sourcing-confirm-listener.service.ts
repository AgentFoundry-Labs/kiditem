import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import {
  SOURCING_CONFIRM_MESSENGER_PORT,
  type SourcingConfirmMessengerPort,
} from '../port/out/provider/sourcing-confirm-messenger.port';
import { SourcingConfirmReportService } from './sourcing-confirm-report.service';

/** 같은 봇을 다른 곳이 읽고 있을 때 다시 묻기까지. */
const CONFLICT_WAIT_MS = 30_000;
const MAX_FAILURE_WAIT_MS = 60_000;
/** 멈춤 신호로 쓰는 값. */
const STOP = -1;

/**
 * 컨펌 보고의 버튼 답장을 받아 반영하는 루프. API 서버 프로세스에서만 돈다.
 *
 * 봇 토큰이 없거나 `SOURCING_CONFIRM_TELEGRAM_POLLING=0` 이면 켜지 않는다. 한 바퀴는 긴
 * 요청 하나라 답장이 없으면 그냥 기다린다. 토큰이 틀리면 멈추고(다시 해도 소용없다), 같은 봇을
 * 다른 곳이 읽으면 잠시 물러났다가 다시 묻는다. 답장 하나를 처리하다 실패해도 다음 답장은
 * 계속 받는다.
 */
@Injectable()
export class SourcingConfirmListenerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SourcingConfirmListenerService.name);
  private controller: AbortController | null = null;
  private loop: Promise<void> | null = null;
  private conflictLogged = false;

  constructor(
    @Inject(SOURCING_CONFIRM_MESSENGER_PORT)
    private readonly messenger: SourcingConfirmMessengerPort,
    private readonly reports: SourcingConfirmReportService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.messenger.setup().listening) return;
    this.controller = new AbortController();
    this.loop = this.run(this.controller.signal);
    this.logger.log('텔레그램 컨펌 답장을 받기 시작합니다.');
  }

  async onModuleDestroy(): Promise<void> {
    this.controller?.abort();
    await this.loop;
    this.loop = null;
  }

  /** 한 바퀴. 다음 바퀴까지 기다릴 시간(ms)을 돌려주고, 멈춰야 하면 음수를 돌려준다. */
  async pollOnce(signal: AbortSignal): Promise<number> {
    const result = await this.messenger.receive(signal);
    switch (result.kind) {
      case 'ok':
        this.conflictLogged = false;
        for (const event of result.events) {
          try {
            await this.reports.handleEvent(event);
          } catch (error) {
            this.logger.warn(`텔레그램 컨펌 답장을 반영하지 못했습니다: ${describeError(error)}`);
          }
        }
        return 0;
      case 'conflict':
        if (!this.conflictLogged) {
          this.logger.warn('같은 텔레그램 봇을 다른 곳에서 읽고 있습니다. 환경마다 봇을 따로 쓰세요.');
          this.conflictLogged = true;
        }
        return CONFLICT_WAIT_MS;
      case 'unauthorized':
        this.logger.error('텔레그램 봇 토큰이 맞지 않아 컨펌 답장 받기를 멈춥니다.');
        return STOP;
      case 'unavailable':
        return result.retryAfterMs;
    }
  }

  private async run(signal: AbortSignal): Promise<void> {
    let failures = 0;
    while (!signal.aborted) {
      let wait: number;
      try {
        wait = await this.pollOnce(signal);
        failures = 0;
      } catch (error) {
        if (signal.aborted) return;
        failures += 1;
        wait = Math.min(MAX_FAILURE_WAIT_MS, 1_000 * 2 ** failures);
        this.logger.warn(`텔레그램 컨펌 답장 받기 실패 — ${wait / 1000}초 뒤 다시: ${describeError(error)}`);
      }
      if (wait < 0) return;
      if (wait > 0) await sleep(wait, signal);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    timer.unref?.();
    signal.addEventListener('abort', done, { once: true });
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
