import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ResultCleanupService {
  private readonly logger = new Logger(ResultCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a rule-based summary from resultJson.
   * No LLM — just extract key info.
   */
  generateSummary(resultJson: Record<string, unknown> | null, errorCode: string | null): string {
    if (errorCode) return `실패: ${errorCode}`;
    if (!resultJson) return '정상 실행 완료';

    const actions = resultJson.actions as any[];
    if (Array.isArray(actions) && actions.length > 0) {
      const types = [...new Set(actions.map((a: any) => a.action || a.type || 'unknown'))];
      return `${actions.length}개 액션 실행: ${types.join(', ')}`;
    }

    const keys = Object.keys(resultJson).filter(k => k !== 'nextSchedule');
    if (keys.length === 0) return '정상 실행 완료 (빈 결과)';
    return `정상 실행 완료: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ` 외 ${keys.length - 3}건` : ''}`;
  }

  /**
   * Cleanup old results for a single agent.
   * Returns number of runs summarized.
   */
  async cleanupAgent(agentId: string, retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const oldRuns = await this.prisma.heartbeatRun.findMany({
      where: {
        agentId,
        isSummarized: false,
        finishedAt: { lt: cutoff },
        status: { not: 'running' },
      },
      select: {
        id: true,
        resultJson: true,
        errorCode: true,
      },
    });

    if (oldRuns.length === 0) return 0;

    for (const run of oldRuns) {
      const summary = this.generateSummary(
        run.resultJson as Record<string, unknown> | null,
        run.errorCode,
      );

      await this.prisma.heartbeatRun.update({
        where: { id: run.id },
        data: {
          isSummarized: true,
          summary,
          stdoutExcerpt: null,
          stderrExcerpt: null,
          resultJson: Prisma.JsonNull, // Clear full JSON, summary preserved
        },
      });
    }

    return oldRuns.length;
  }

  /**
   * Cleanup all agents. Called by daily cron.
   */
  async cleanupAll(): Promise<{ processed: number; summarized: number }> {
    const agents = await this.prisma.agentDefinition.findMany({
      where: { isActive: true },
      select: { id: true, resultRetentionDays: true },
    });

    let totalSummarized = 0;
    for (const agent of agents) {
      const count = await this.cleanupAgent(agent.id, agent.resultRetentionDays);
      totalSummarized += count;
    }

    if (totalSummarized > 0) {
      this.logger.log(`Result cleanup: ${agents.length} agents, ${totalSummarized} runs summarized`);
    }

    return { processed: agents.length, summarized: totalSummarized };
  }
}
