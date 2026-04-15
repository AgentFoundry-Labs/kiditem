import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { scrubSecrets, scrubDeep } from '@kiditem/shared';

export interface TranscriptData {
  runId: string;
  stdoutExcerpt: string;
  stderrExcerpt: string;
  usageJson: Record<string, unknown> | null;
  sessionIdAfter?: string;
}

export const TRANSCRIPT_EVENT = 'agent.run.transcript';

@Injectable()
export class TranscriptService implements OnModuleInit {
  private readonly logger = new Logger(TranscriptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.eventEmitter.on(TRANSCRIPT_EVENT, (data: TranscriptData) => {
      this.recordAsync(data).catch(err =>
        this.logger.error(`Async transcript failed: ${err}`),
      );
    });
  }

  private async recordAsync(data: TranscriptData): Promise<void> {
    // 방어심층 scrub: heartbeat 에서 이미 1차 scrub 됐지만 새 저장 지점 추가 시 누락 대비.
    // usageJson 은 heartbeat 에서 scrub 하지 않으므로 여기서만 scrubDeep.
    await this.prisma.heartbeatRun.update({
      where: { id: data.runId },
      data: {
        stdoutExcerpt: scrubSecrets(data.stdoutExcerpt),
        stderrExcerpt: scrubSecrets(data.stderrExcerpt),
        usageJson: scrubDeep(data.usageJson) as any,
        sessionIdAfter: data.sessionIdAfter,
      },
    });
  }
}
