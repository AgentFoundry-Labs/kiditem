import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';

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
    await this.prisma.heartbeatRun.update({
      where: { id: data.runId },
      data: {
        stdoutExcerpt: data.stdoutExcerpt,
        stderrExcerpt: data.stderrExcerpt,
        usageJson: data.usageJson as any,
        sessionIdAfter: data.sessionIdAfter,
      },
    });
  }
}
