import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompressorService {
  private readonly logger = new Logger(CompressorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build compressed context from recent execution history.
   * 4-layer compression:
   *   Layer 1 (recent 3): full resultJson
   *   Layer 2 (4-10): summary only
   *   Layer 3 (11+): skip
   *   Layer 4: truncate to maxTokens
   *
   * @param maxTokens approximate token budget (1 token ≈ 4 chars)
   */
  async buildCompressedContext(agentId: string, maxTokens: number = 4000): Promise<string> {
    const maxChars = maxTokens * 4;

    const runs = await this.prisma.heartbeatRun.findMany({
      where: { agentId, status: { in: ['succeeded', 'failed'] } },
      orderBy: { finishedAt: 'desc' },
      take: 10,
      select: {
        finishedAt: true,
        status: true,
        failureType: true,  // needed for label ternary
        resultJson: true,
        summary: true,
        isSummarized: true,
        errorCode: true,
      },
    });

    if (runs.length === 0) return '';

    const parts: string[] = ['=== 최근 실행 이력 ==='];

    // Layer 1: recent 3 runs — full detail
    const recentRuns = runs.slice(0, 3);
    for (let i = 0; i < recentRuns.length; i++) {
      const r = recentRuns[i];
      const date = r.finishedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '?';
      const statusLabel =
        r.status === 'succeeded' ? '성공' :
        r.failureType === 'timeout' ? '타임아웃' :
        r.status === 'failed' ? '실패' :
        r.status;  // defensive fallback (pending/running/cancelled — shouldn't reach here due to WHERE)

      if (r.isSummarized || !r.resultJson) {
        parts.push(`[${i + 1}] ${date} (${statusLabel}): ${r.summary ?? r.errorCode ?? '결과 없음'}`);
      } else {
        const json = JSON.stringify(r.resultJson);
        const trimmed = json.length > 2000 ? json.slice(0, 2000) + '...' : json;
        parts.push(`[${i + 1}] ${date} (${statusLabel}): ${trimmed}`);
      }
    }

    // Layer 2: runs 4-10 — summary only
    const olderRuns = runs.slice(3);
    if (olderRuns.length > 0) {
      parts.push('---');
      const succeeded = olderRuns.filter(r => r.status === 'succeeded').length;
      const summaries = olderRuns
        .map(r => r.summary)
        .filter(Boolean)
        .slice(0, 3);

      let olderSummary = `[4-${3 + olderRuns.length}] ${olderRuns.length}회 실행, ${succeeded}회 성공`;
      if (summaries.length > 0) {
        olderSummary += `. 요약: ${summaries.join('; ')}`;
      }
      parts.push(olderSummary);
    }

    // Layer 4: truncate to budget
    let result = parts.join('\n');
    if (result.length > maxChars) {
      result = result.slice(0, maxChars - 3) + '...';
    }

    return result;
  }
}
