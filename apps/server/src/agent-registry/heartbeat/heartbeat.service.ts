import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CronJob } from 'cron';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { WakeupService, WakeupSource } from '../wakeup/wakeup.service';
import { SkillsService } from '../skills/skills.service';
import { getAdapter } from '../adapters/registry';
import type { ExecutionContext } from '../adapters/types';
import {
  AgentStatusChangedEvent,
  AgentBudgetWarningEvent,
  AgentAutoPausedEvent,
  AGENT_EVENTS,
} from '../events/agent-events';
import { FeatureGateService } from '../../feature-gate/feature-gate.service';
import { validateAgentOutput, extractResultJsonFromStdout } from '../schemas/validate-output';
// Agent OS modules
import { SkillFilterService } from '../safety/skill-filter.service';
import { RetryService } from '../lifecycle/retry.service';
import { TRANSCRIPT_EVENT } from '../lifecycle/transcript.service';

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private readonly runningAgents = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly wakeupService: WakeupService,
    private readonly skillsService: SkillsService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly eventEmitter: EventEmitter2,
    private readonly featureGateService: FeatureGateService,
    @Optional() private readonly skillFilterService?: SkillFilterService,
    @Optional() private readonly retryService?: RetryService,
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

    // 피처 게이트 체크
    const gateAllowed = await this.featureGateService.isEnabled(`agent:${agent.type}`, companyId);
    if (!gateAllowed) {
      return { ok: false, error: 'feature_gate_blocked', agentId: input.agentId };
    }

    // 예산 체크 (단계화: 80% 경고 → 95% 위험 → 100% 차단)
    if (agent.monthlyTokenBudget > 0) {
      const usageRatio = agent.tokensUsed / agent.monthlyTokenBudget;
      if (usageRatio >= 1.0) {
        this.eventEmitter.emit(
          AGENT_EVENTS.BUDGET_WARNING,
          new AgentBudgetWarningEvent(
            agent.id, agent.name, 'exceeded', usageRatio,
            agent.tokensUsed, agent.monthlyTokenBudget,
          ),
        );
        return { ok: false, error: 'budget_exceeded', agentId: input.agentId };
      }
      if (usageRatio >= 0.95) {
        this.logger.error(`Agent ${agent.name} budget critical: ${agent.tokensUsed}/${agent.monthlyTokenBudget} (${Math.round(usageRatio * 100)}%)`);
        this.eventEmitter.emit(
          AGENT_EVENTS.BUDGET_WARNING,
          new AgentBudgetWarningEvent(
            agent.id, agent.name, 'critical', usageRatio,
            agent.tokensUsed, agent.monthlyTokenBudget,
          ),
        );
      } else if (usageRatio >= 0.80) {
        this.logger.warn(`Agent ${agent.name} budget warning: ${agent.tokensUsed}/${agent.monthlyTokenBudget} (${Math.round(usageRatio * 100)}%)`);
        this.eventEmitter.emit(
          AGENT_EVENTS.BUDGET_WARNING,
          new AgentBudgetWarningEvent(
            agent.id, agent.name, 'warning', usageRatio,
            agent.tokensUsed, agent.monthlyTokenBudget,
          ),
        );
      }
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

  private async executeHeartbeatAsync(agentId: string): Promise<void> {
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

    // #24 Prefetch + Harvest — parallel preparation
    const buildSkillsPromise = (async () => {
      try {
        const filteredSkills = this.skillFilterService
          ? this.skillFilterService.filterAndSort(agent.skills, (agent as any).deniedSkills ?? [])
          : [...agent.skills].sort();
        return await this.skillsService.buildSkillsDir(filteredSkills);
      } catch (err) {
        this.logger.warn(`Failed to build skills dir: ${err}`);
        return null;
      }
    })();

    const [runtimeState, skillsDir] = await Promise.all([
      this.prisma.agentRuntimeState.findUnique({ where: { agentId } }),
      buildSkillsPromise,
    ]);

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

    this.eventEmitter.emit(
      AGENT_EVENTS.STATUS_CHANGED,
      new AgentStatusChangedEvent(agent.id, agent.name, 'running', run.id),
    );

    // Skills already built in prefetch above

    // Prompt 빌드
    const prompt = await this.buildPrompt(agent, run.id, wakeup.payload as Record<string, unknown>);

    // Adapter 실행
    const adapter = getAdapter(agent.adapterType);
    const adapterConfig = (agent.adapterConfig as Record<string, unknown>) || {};

    const ctx: ExecutionContext = Object.freeze({
      runId: run.id,
      agent: Object.freeze({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        permissions: (agent.permissions as Record<string, unknown>) || {},
      }),
      config: Object.freeze(adapterConfig),
      prompt,
      skillPaths: Object.freeze(skillsDir ? [skillsDir] : []),
      sessionId: runtimeState?.sessionId ?? undefined,
      timeoutSec: agent.timeoutSeconds,
      graceSec: 10,
      env: Object.freeze({
        KIDITEM_AGENT_ID: agent.id,
        KIDITEM_COMPANY_ID: companyId,
        KIDITEM_RUN_ID: run.id,
        AGENT_DATABASE_URL: process.env.AGENT_DATABASE_URL || process.env.DATABASE_URL || '',
      }),
      cwd: (adapterConfig.cwd as string) || process.cwd(),
      allowedTools: agent.allowedTools,
      permissionMode: agent.permissionMode,
    });

    this.logger.log(`Heartbeat starting: ${agent.name} (run=${run.id})`);

    let result;
    try {
      result = await adapter.execute(ctx);

      // Session conflict retry — "session already in use" → retry without session (immutable ctx)
      if (result.exitCode !== 0 && result.stderr.includes('already in use') && ctx.sessionId) {
        this.logger.warn(`Session conflict for ${agent.name}, retrying without session resume`);
        const retryCtx: ExecutionContext = Object.freeze({
          ...ctx,
          sessionId: undefined,
          config: Object.freeze({ ...ctx.config, _skipSessionResume: true }),
        });
        result = await adapter.execute(retryCtx);
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

    let errorCode = result.timedOut ? 'timeout'
      : result.exitCode !== 0 ? 'process_error'
      : null;

    // Structured Output 검증 + #19 Validation Retry
    let resultJson: Record<string, unknown> | null = null;
    if (status === 'succeeded') {
      resultJson = extractResultJsonFromStdout(result.stdout);
      if (resultJson) {
        const validation = validateAgentOutput(agent.type, resultJson);
        if (!validation.valid) {
          // #19 Validation Retry — 1회 재시도
          const retryPrompt = this.retryService?.buildRetryPrompt(
            ctx.prompt, validation.errors ?? [], 0,
          );
          if (retryPrompt) {
            this.logger.warn(`Agent ${agent.name} validation failed, retrying once`);
            this.eventEmitter.emit(AGENT_EVENTS.VALIDATION_RETRY, { agentId: agent.id, runId: run.id });
            const retryCtx: ExecutionContext = Object.freeze({
              ...ctx,
              prompt: retryPrompt,
              sessionId: result.sessionIdAfter ?? ctx.sessionId,
            });
            const retryResult = await adapter.execute(retryCtx);
            const retryJson = extractResultJsonFromStdout(retryResult.stdout);
            if (retryJson) {
              const retryValidation = validateAgentOutput(agent.type, retryJson);
              if (retryValidation.valid) {
                result = retryResult;
                resultJson = retryValidation.data as Record<string, unknown>;
                errorCode = null;
              } else {
                errorCode = 'validation_failed';
              }
            } else {
              errorCode = 'validation_failed';
            }
          } else {
            this.logger.warn(
              `Agent ${agent.name} output validation failed: ${validation.errors?.join('; ')}`,
            );
            errorCode = 'validation_failed';
          }
        } else {
          resultJson = validation.data as Record<string, unknown>;
        }
      }
    }

    // #17 Async Transcript — Step 1: Blocking save (critical fields only)
    await this.prisma.heartbeatRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        exitCode: result.exitCode,
        signal: result.signal,
        errorCode,
        error: errorCode ? result.stderr.slice(0, 1000) : null,
        resultJson: resultJson as any,
      },
    });

    // #17 Async Transcript — Step 2: Fire-and-forget (non-critical fields)
    this.eventEmitter.emit(TRANSCRIPT_EVENT, {
      runId: run.id,
      stdoutExcerpt: result.stdout.slice(0, 5000),
      stderrExcerpt: result.stderr.slice(0, 2000),
      usageJson: result.usage ?? null,
      sessionIdAfter: result.sessionIdAfter,
    });

    // Runtime state 업데이트 (에러 복구 캐스케이드 포함)
    const isFailed = status === 'failed' || status === 'timed_out';
    const prevFailCount = runtimeState?.consecutiveFailCount ?? 0;
    const newFailCount = isFailed ? prevFailCount + 1 : 0;

    const updatedRuntimeState = await this.prisma.agentRuntimeState.upsert({
      where: { agentId },
      update: {
        sessionId: result.sessionIdAfter ?? runtimeState?.sessionId,
        lastRunId: run.id,
        lastRunStatus: status,
        lastError: errorCode ? result.stderr.slice(0, 500) : null,
        totalInputTokens: { increment: result.usage?.inputTokens ?? 0 },
        totalOutputTokens: { increment: result.usage?.outputTokens ?? 0 },
        totalCostCents: { increment: result.usage?.costCents ?? 0 },
        consecutiveFailCount: newFailCount,
        lastFailedAt: isFailed ? new Date() : runtimeState?.lastFailedAt,
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
        consecutiveFailCount: newFailCount,
        lastFailedAt: isFailed ? new Date() : null,
      },
    });

    // 에러 복구 캐스케이드: 연속 3회 실패 시 자동 pause
    if (updatedRuntimeState.consecutiveFailCount >= 3) {
      this.logger.error(
        `Agent ${agent.name} auto-paused: ${updatedRuntimeState.consecutiveFailCount} consecutive failures`,
      );
      await this.prisma.agentDefinition.update({
        where: { id: agentId },
        data: {
          status: 'paused',
          pauseReason: `consecutive_failures(${updatedRuntimeState.consecutiveFailCount})`,
          pausedAt: new Date(),
        },
      });

      this.eventEmitter.emit(
        AGENT_EVENTS.STATUS_CHANGED,
        new AgentStatusChangedEvent(agent.id, agent.name, 'paused', run.id),
      );
      this.eventEmitter.emit(
        AGENT_EVENTS.AUTO_PAUSED,
        new AgentAutoPausedEvent(
          agent.id, agent.name,
          updatedRuntimeState.consecutiveFailCount,
          updatedRuntimeState.lastError ?? undefined,
        ),
      );
    } else {
      // Agent 상태 복귀
      await this.prisma.agentDefinition.update({
        where: { id: agentId },
        data: { status: 'idle' },
      });

      // succeeded 또는 failed (아직 auto-pause 임계 미달)
      const finalStatus = status === 'succeeded' ? 'succeeded' : 'failed';
      this.eventEmitter.emit(
        AGENT_EVENTS.STATUS_CHANGED,
        new AgentStatusChangedEvent(agent.id, agent.name, finalStatus as any, run.id),
      );
    }

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

  async syncTimers(): Promise<void> {
    this.clearTimerJobs();

    const agents = await this.prisma.agentDefinition.findMany({
      where: { isActive: true },
    });

    for (const agent of agents) {
      if (!agent.companyId) continue;
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

  private async onTimerFire(agentId: string, companyId: string | null): Promise<void> {
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

  private async buildPrompt(
    agent: { promptTemplate: string; type: string },
    runId: string,
    payload?: Record<string, unknown>,
  ): Promise<string> {
    const dbUrl = process.env.AGENT_DATABASE_URL || process.env.DATABASE_URL || '';
    const dryRun = payload?.dry_run !== undefined ? String(payload.dry_run) : 'true';
    const resultApiBase = (payload?.result_api_base as string) || '/api/agent-registry/results';
    const resultApi = `http://localhost:4000${resultApiBase}/${runId}`;

    let template = agent.promptTemplate;
    if (template.startsWith('agent-config/')) {
      template = await readFile(join(process.cwd(), template), 'utf-8');
    }

    let prompt = template;

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
