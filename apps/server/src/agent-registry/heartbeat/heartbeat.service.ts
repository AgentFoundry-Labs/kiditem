import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../../prisma/prisma.service';
import { WakeupService, WakeupSource } from '../wakeup/wakeup.service';
import { SkillsService } from '../skills/skills.service';
import { getAdapter } from '../adapters/registry';
import type { ExecutionContext } from '../adapters/types';

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private readonly runningAgents = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly wakeupService: WakeupService,
    private readonly skillsService: SkillsService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  // ── Wakeup 처리 ──

  /**
   * 에이전트에게 wakeup 요청 후 즉시 실행.
   * 이미 실행 중이면 wakeup만 큐에 넣고 coalescing.
   */
  async wakeAgent(input: {
    agentId: string;
    companyId?: string;
    source: WakeupSource;
    reason?: string;
    payload?: Record<string, unknown>;
    requestedByType?: string;
    requestedById?: string;
  }) {
    const agent = await this.prisma.agentDefinition.findUnique({ where: { id: input.agentId } });
    if (!agent) throw new Error(`Agent ${input.agentId} not found`);
    if (agent.status === 'paused' || agent.status === 'disabled') {
      return { ok: false, error: 'agent_paused', agentId: input.agentId };
    }

    const companyId = input.companyId || agent.companyId;
    if (!companyId) throw new Error(`No companyId for agent ${agent.name}`);

    // 예산 체크
    if (agent.monthlyTokenBudget > 0 && agent.tokensUsed >= agent.monthlyTokenBudget) {
      return { ok: false, error: 'budget_exceeded', agentId: input.agentId };
    }

    const wakeup = await this.wakeupService.requestWakeup({
      agentId: input.agentId,
      companyId,
      source: input.source,
      reason: input.reason,
      payload: input.payload,
      requestedByType: input.requestedByType,
      requestedById: input.requestedById,
    });

    // 이미 실행 중이면 coalesced → 다음 heartbeat에서 처리
    if (this.runningAgents.has(input.agentId)) {
      this.logger.debug(`Agent ${agent.name} already running, wakeup queued`);
      return { ok: true, queued: true, wakeupId: wakeup.id };
    }

    // 즉시 실행
    this.executeHeartbeatAsync(agent.id);
    return { ok: true, queued: false, wakeupId: wakeup.id };
  }

  // ── Heartbeat 실행 ──

  private async executeHeartbeatAsync(agentId: string) {
    if (this.runningAgents.has(agentId)) return;
    this.runningAgents.add(agentId);

    try {
      await this.executeHeartbeat(agentId);
    } finally {
      this.runningAgents.delete(agentId);
    }
  }

  private async executeHeartbeat(agentId: string) {
    const agent = await this.prisma.agentDefinition.findUnique({ where: { id: agentId } });
    if (!agent) return;

    // Wakeup claim
    const wakeup = await this.wakeupService.claimNext(agentId);
    if (!wakeup) return;

    const companyId = wakeup.companyId;

    // Runtime state (session resume)
    const runtimeState = await this.prisma.agentRuntimeState.findUnique({ where: { agentId } });

    // HeartbeatRun 생성
    const run = await this.prisma.heartbeatRun.create({
      data: {
        agent: { connect: { id: agentId } },
        company: { connect: { id: companyId } },
        invocationSource: wakeup.source,
        triggerDetail: wakeup.triggerDetail,
        status: 'running',
        startedAt: new Date(),
        sessionIdBefore: runtimeState?.sessionId,
        wakeupRequest: { connect: { id: wakeup.id } },
      },
    });

    // Agent 상태 업데이트
    await this.prisma.agentDefinition.update({
      where: { id: agentId },
      data: { status: 'running', lastHeartbeatAt: new Date() },
    });

    // Skills 준비
    let skillsDir: string | null = null;
    try {
      skillsDir = await this.skillsService.buildSkillsDir(agent.skills);
    } catch (err) {
      this.logger.warn(`Failed to build skills dir: ${err}`);
    }

    // Prompt 빌드
    const prompt = this.buildPrompt(agent, run.id, wakeup.payload as Record<string, unknown>);

    // Adapter 실행
    const adapter = getAdapter(agent.adapterType);
    const adapterConfig = (agent.adapterConfig as Record<string, unknown>) || {};

    const ctx: ExecutionContext = {
      runId: run.id,
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        permissions: (agent.permissions as Record<string, unknown>) || {},
      },
      config: adapterConfig,
      prompt,
      skillPaths: skillsDir ? [skillsDir] : [],
      sessionId: runtimeState?.sessionId ?? undefined,
      timeoutSec: agent.timeoutSeconds,
      graceSec: 10,
      env: {
        KIDITEM_AGENT_ID: agent.id,
        KIDITEM_COMPANY_ID: companyId,
        KIDITEM_RUN_ID: run.id,
      },
      cwd: (adapterConfig.cwd as string) || process.cwd(),
      allowedTools: agent.allowedTools,
      permissionMode: agent.permissionMode,
    };

    this.logger.log(`Heartbeat starting: ${agent.name} (run=${run.id})`);

    let result;
    try {
      result = await adapter.execute(ctx);

      // Session conflict retry — "session already in use" → retry without session
      if (result.exitCode !== 0 && result.stderr.includes('already in use') && ctx.sessionId) {
        this.logger.warn(`Session conflict for ${agent.name}, retrying without session resume`);
        ctx.sessionId = undefined;
        ctx.config = { ...ctx.config, _skipSessionResume: true };
        result = await adapter.execute(ctx);
      }
    } catch (err: any) {
      result = {
        exitCode: 1,
        signal: null,
        timedOut: false,
        stdout: '',
        stderr: `Adapter error: ${err.message}`,
      };
    }

    // Cleanup skills
    if (skillsDir) this.skillsService.cleanup(skillsDir);

    // 결과 로깅
    this.logger.debug(`Heartbeat result: agent=${agent.name}, exit=${result.exitCode}, usage=${JSON.stringify(result.usage)}`);
    if (result.usage?.costCents) {
      this.logger.log(`Cost recorded: agent=${agent.name}, cost=${result.usage.costCents}cents, tokens=${(result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)}`);
    }

    // 결과 저장
    const status = result.timedOut ? 'timed_out'
      : result.exitCode === 0 ? 'succeeded'
      : 'failed';

    const errorCode = result.timedOut ? 'timeout'
      : result.exitCode !== 0 ? 'process_error'
      : null;

    await this.prisma.heartbeatRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        exitCode: result.exitCode,
        signal: result.signal,
        stdoutExcerpt: result.stdout.slice(0, 5000),
        stderrExcerpt: result.stderr.slice(0, 2000),
        errorCode,
        error: errorCode ? result.stderr.slice(0, 1000) : null,
        sessionIdAfter: result.sessionIdAfter,
        usageJson: result.usage as any,
      },
    });

    // Runtime state 업데이트
    await this.prisma.agentRuntimeState.upsert({
      where: { agentId },
      update: {
        sessionId: result.sessionIdAfter ?? runtimeState?.sessionId,
        lastRunId: run.id,
        lastRunStatus: status,
        lastError: errorCode ? result.stderr.slice(0, 500) : null,
        totalInputTokens: { increment: result.usage?.inputTokens ?? 0 },
        totalOutputTokens: { increment: result.usage?.outputTokens ?? 0 },
        totalCostCents: { increment: result.usage?.costCents ?? 0 },
      },
      create: {
        agent: { connect: { id: agentId } },
        company: { connect: { id: companyId } },
        adapterType: agent.adapterType,
        sessionId: result.sessionIdAfter,
        lastRunId: run.id,
        lastRunStatus: status,
        lastError: errorCode ? result.stderr.slice(0, 500) : null,
        totalInputTokens: result.usage?.inputTokens ?? 0,
        totalOutputTokens: result.usage?.outputTokens ?? 0,
        totalCostCents: result.usage?.costCents ?? 0,
      },
    });

    // Agent 상태 복귀
    await this.prisma.agentDefinition.update({
      where: { id: agentId },
      data: { status: 'idle' },
    });

    // Wakeup 완료
    await this.wakeupService.finish(wakeup.id, run.id, errorCode ? result.stderr.slice(0, 500) : undefined);

    // Legacy AgentTask 동기화 — run() 경유로 생성된 task가 있으면 업데이트
    const payload = wakeup.payload as Record<string, unknown> | null;
    const legacyTaskId = payload?._legacy_task_id as string | undefined;
    if (legacyTaskId) {
      try {
        await this.prisma.agentTask.update({
          where: { id: legacyTaskId },
          data: {
            status: status === 'succeeded' ? 'completed' : 'failed',
            error: errorCode ? result.stderr.slice(0, 1000) : null,
            completedAt: new Date(),
          },
        });
      } catch { /* task might not exist or already updated by callback */ }
    }

    this.logger.log(`Heartbeat finished: ${agent.name} (run=${run.id}, status=${status})`);

    return { runId: run.id, status };
  }

  // ── Timer 스케줄러 ──

  async syncTimers() {
    this.clearTimerJobs();

    const agents = await this.prisma.agentDefinition.findMany({
      where: { isActive: true },
    });

    for (const agent of agents) {
      const runtime = (agent.runtimeConfig as Record<string, unknown>) || {};
      const intervalSec = (runtime.intervalSec as number) || 0;

      // schedule 필드 (cron) 사용
      if (agent.schedule) {
        try {
          const jobName = `heartbeat-timer-${agent.id}`;
          const job = new CronJob(
            agent.schedule,
            () => this.onTimerFire(agent.id, agent.companyId),
            null, true, 'Asia/Seoul',
          );
          this.schedulerRegistry.addCronJob(jobName, job);
          this.logger.log(`Timer registered: ${agent.name} (${agent.schedule})`);
        } catch (e) {
          this.logger.error(`Invalid cron for ${agent.name}: ${agent.schedule}`);
        }
      }

      // intervalSec 기반 (초 단위 반복)
      if (intervalSec > 0 && !agent.schedule) {
        const jobName = `heartbeat-interval-${agent.id}`;
        const interval = setInterval(
          () => this.onTimerFire(agent.id, agent.companyId),
          intervalSec * 1000,
        );
        this.schedulerRegistry.addInterval(jobName, interval);
        this.logger.log(`Interval registered: ${agent.name} (${intervalSec}s)`);
      }
    }
  }

  private clearTimerJobs() {
    const cronJobs = this.schedulerRegistry.getCronJobs();
    cronJobs.forEach((_, name) => {
      if (name.startsWith('heartbeat-timer-') || name.startsWith('agent-heartbeat-')) {
        this.schedulerRegistry.deleteCronJob(name);
      }
    });

    try {
      const intervals = this.schedulerRegistry.getIntervals();
      intervals.forEach((name) => {
        if (name.startsWith('heartbeat-interval-')) {
          this.schedulerRegistry.deleteInterval(name);
        }
      });
    } catch { /* no intervals */ }
  }

  private async onTimerFire(agentId: string, companyId: string | null) {
    try {
      await this.wakeAgent({
        agentId,
        companyId: companyId ?? undefined,
        source: 'timer',
        reason: 'Scheduled heartbeat',
      });
    } catch (err) {
      this.logger.error(`Timer wakeup failed for ${agentId}: ${err}`);
    }
  }

  // ── Prompt 빌드 ──

  private buildPrompt(
    agent: { promptTemplate: string; type: string },
    runId: string,
    payload?: Record<string, unknown>,
  ): string {
    const dbUrl = process.env.DATABASE_URL || '';
    const dryRun = payload?.dry_run !== undefined ? String(payload.dry_run) : 'true';
    const resultApiBase = (payload?.result_api_base as string) || '/api/agent-registry/results';
    const resultApi = `http://localhost:4000${resultApiBase}/${runId}`;

    let prompt = agent.promptTemplate;

    // 기본 변수 치환
    prompt = prompt
      .replace(/\{\{task_id\}\}/g, runId)
      .replace(/\{\{dry_run\}\}/g, dryRun)
      .replace(/\{\{db_url\}\}/g, dbUrl)
      .replace(/\{\{result_api\}\}/g, resultApi);

    // payload 변수 치환
    if (payload) {
      for (const [key, value] of Object.entries(payload)) {
        if (key.startsWith('_')) continue; // 내부 키 스킵
        prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
      }
    }

    return prompt;
  }
}
