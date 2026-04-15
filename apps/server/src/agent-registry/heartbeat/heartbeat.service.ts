import {
  Injectable,
  Logger,
  Inject,
  Optional,
  forwardRef,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CronJob } from 'cron';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { WakeupService, WakeupSource } from '../wakeup/wakeup.service';
import { SkillsService } from '../skills/skills.service';
import { getFallbackChain } from '../adapters/registry';
import { executeFallbackChain } from '../adapters/fallback-chain';
import type { ExecutionContext } from '../adapters/types';
import { collectResult } from '../adapters/types';
import {
  AgentStatusChangedEvent,
  AgentBudgetWarningEvent,
  AgentAutoPausedEvent,
  AgentResultReadyEvent,
  AGENT_EVENTS,
} from '../events/agent-events';
import { FeatureGateService } from '../../feature-gate/feature-gate.service';
import { validateAgentOutput, extractResultJsonFromStdout } from '../schemas/validate-output';
// Agent OS modules
import { resolvePermissions } from '../permissions/hierarchy.validator';
import { SkillFilterService } from '../safety/skill-filter.service';
import { RetryService } from '../lifecycle/retry.service';
import { TRANSCRIPT_EVENT } from '../lifecycle/transcript.service';
import { ResultCleanupService } from '../lifecycle/result-cleanup.service';
import { SafetyPipelineService } from '../business-safety/safety-pipeline.service';
import { DryRunGateService } from '../business-safety/dry-run-gate.service';
import type { PermissionLayer } from '../permissions/hierarchy.validator';
import { scrubSecrets } from '@kiditem/shared';

/** Extract company-level permission layer from agent.permissions JSON. Future extension point. */
function extractCompanyLayer(permissions: Record<string, unknown> | null | undefined): PermissionLayer | undefined {
  if (!permissions?.company) return undefined;
  return permissions.company as PermissionLayer;
}

/** Extract agentType-level permission layer from agent.permissions JSON. Future extension point. */
function extractTypeLayer(permissions: Record<string, unknown> | null | undefined): PermissionLayer | undefined {
  if (!permissions?.agentType) return undefined;
  return permissions.agentType as PermissionLayer;
}

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
    @Optional() private readonly safetyPipeline?: SafetyPipelineService,
    @Optional() private readonly dryRunGate?: DryRunGateService,
    @Optional() @Inject(forwardRef(() => ResultCleanupService))
    private readonly resultCleanupService?: ResultCleanupService,
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
    if (!agent) throw new NotFoundException(`Agent ${input.agentId} not found`);
    if (agent.status === 'paused' || agent.status === 'disabled') {
      return { ok: false, error: 'agent_paused', agentId: input.agentId };
    }

    const companyId = input.companyId || agent.companyId;
    if (!companyId) throw new BadRequestException(`No companyId for agent ${agent.name}`);

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
            agent.tokensUsed, agent.monthlyTokenBudget, companyId,
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
            agent.tokensUsed, agent.monthlyTokenBudget, companyId,
          ),
        );
      } else if (usageRatio >= 0.80) {
        this.logger.warn(`Agent ${agent.name} budget warning: ${agent.tokensUsed}/${agent.monthlyTokenBudget} (${Math.round(usageRatio * 100)}%)`);
        this.eventEmitter.emit(
          AGENT_EVENTS.BUDGET_WARNING,
          new AgentBudgetWarningEvent(
            agent.id, agent.name, 'warning', usageRatio,
            agent.tokensUsed, agent.monthlyTokenBudget, companyId,
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

    // Permission Hierarchy Resolution (Pattern #8)
    const instanceTools = (agent.allowedTools ?? '').split(/\s+/).filter(Boolean);
    const resolved = resolvePermissions(
      [
        // Layer 1: global defaults — future extension point (returns undefined for now)
        {},
        // Layer 2: company-level — future extension point from agent.permissions JSON
        ...(extractCompanyLayer((agent as any).permissions) ? [extractCompanyLayer((agent as any).permissions)!] : []),
        // Layer 3: agentType-level — future extension point from agent.permissions JSON
        ...(extractTypeLayer((agent as any).permissions) ? [extractTypeLayer((agent as any).permissions)!] : []),
        // Layer 4: instance-level (agent's own fields)
        {
          allowedTools: instanceTools,
          deniedSkills: (agent as any).deniedSkills ?? [],
          permissionMode: agent.permissionMode,
        },
      ],
      {
        allowedTools: instanceTools,
        deniedSkills: [],
        permissionMode: agent.permissionMode,
      },
    );

    // #24 Prefetch + Harvest — parallel preparation
    const buildSkillsPromise = (async () => {
      try {
        const filteredSkills = this.skillFilterService
          ? this.skillFilterService.filterAndSort(agent.skills, resolved.deniedSkills)
          : [...agent.skills].sort();
        return await this.skillsService.buildSkillsDir(filteredSkills);
      } catch (err) {
        this.logger.warn(`Failed to build skills dir: ${err}`);
        return null;
      }
    })();

    const [agentWithRt, skillsDir] = await Promise.all([
      this.prisma.agentDefinition.findUnique({ where: { id: agentId } }),
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
        sessionIdBefore: (agentWithRt as any)?.rtSessionId,
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
      new AgentStatusChangedEvent(agent.id, agent.name, 'running', companyId, run.id),
    );

    // Skills already built in prefetch above

    // Prompt 빌드
    const prompt = await this.buildPrompt(agent, run.id, wakeup.payload as Record<string, unknown>);

    // Adapter 실행
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
      sessionId: (agentWithRt as any)?.rtSessionId ?? undefined,
      timeoutSec: agent.timeoutSeconds,
      graceSec: 10,
      env: Object.freeze({
        KIDITEM_AGENT_ID: agent.id,
        KIDITEM_COMPANY_ID: companyId,
        KIDITEM_RUN_ID: run.id,
        AGENT_DATABASE_URL: process.env.AGENT_DATABASE_URL || process.env.DATABASE_URL || '',
      }),
      cwd: (adapterConfig.cwd as string) || process.cwd(),
      allowedTools: resolved.allowedTools.join(' '),
      permissionMode: resolved.permissionMode,
      maxOutputTokens: agent.maxOutputTokens ?? 16000,
      resolvedPermissions: Object.freeze(resolved),
    });

    this.logger.log(`Heartbeat starting: ${agent.name} (run=${run.id})`);

    const chain = getFallbackChain(agent.type, (agent as any).fallbackChain);
    let result;
    try {
      result = await collectResult(executeFallbackChain(chain, ctx, this.eventEmitter));

      // Session conflict retry — "session already in use" → retry without session (immutable ctx)
      if (result.exitCode !== 0 && result.stderr.includes('already in use') && ctx.sessionId) {
        this.logger.warn(`Session conflict for ${agent.name}, retrying without session resume`);
        const retryCtx: ExecutionContext = Object.freeze({
          ...ctx,
          sessionId: undefined,
          config: Object.freeze({ ...ctx.config, _skipSessionResume: true }),
        });
        result = await collectResult(executeFallbackChain(chain, retryCtx, this.eventEmitter));
      }

      // Token escalation — output truncated → retry with doubled maxOutputTokens (max 1 retry)
      const MAX_OUTPUT_TOKENS_LIMIT = 65536;
      if (result.stopReason === 'max_tokens' && ctx.maxOutputTokens < MAX_OUTPUT_TOKENS_LIMIT) {
        const escalatedTokens = Math.min(ctx.maxOutputTokens * 2, MAX_OUTPUT_TOKENS_LIMIT);
        this.logger.warn(`Token escalation for ${agent.name}: ${ctx.maxOutputTokens} → ${escalatedTokens}`);
        const escalatedCtx: ExecutionContext = Object.freeze({
          ...ctx,
          maxOutputTokens: escalatedTokens,
        });
        result = await collectResult(executeFallbackChain(chain, escalatedCtx, this.eventEmitter));
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
            const retryResult = await collectResult(executeFallbackChain(chain, retryCtx, this.eventEmitter));
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

    // #30 Dynamic Cron — 에이전트가 nextSchedule을 반환하면 타이머 교체
    const nextSchedule = (resultJson as any)?.nextSchedule as string | undefined;
    if (nextSchedule && status === 'succeeded') {
      this.replaceAgentTimer(agentId, nextSchedule).catch((err) => {
        this.logger.error(`replaceAgentTimer failed for ${agentId}: ${err}`);
      });
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
        error: errorCode ? scrubSecrets(result.stderr.slice(0, 1000)) : null,
        resultJson: resultJson as any,
        nextSchedule: nextSchedule ?? null,
      },
    });

    // ── RESULT_READY: Safety Pipeline + domain event ──
    if (status === 'succeeded' && resultJson && companyId) {
      let safetyAllowed = true;

      if (this.safetyPipeline) {
        const safety = await this.safetyPipeline.validate({
          agentId: agent.id,
          trustLevel: (agent as any).trustLevel ?? 0,
          actionCap: (agent as any).actionCap ?? {},
          runId: run.id,
          companyId,
          body: resultJson as any,
        });

        if (!safety.allowed) {
          safetyAllowed = false;
          this.logger.warn(`Run ${run.id} blocked by Safety Pipeline`);
        }

        if (safety.dryRunForced) {
          (resultJson as any).dry_run = true;
        }
      }

      if (safetyAllowed) {
        this.eventEmitter.emit(
          AGENT_EVENTS.RESULT_READY,
          new AgentResultReadyEvent(agent.type, agent.id, run.id, resultJson, companyId),
        );

        // TrustLevel 조정
        if (this.dryRunGate) {
          await this.dryRunGate.adjustTrust(agent.id, true);
        }
      }
    }

    // #17 Async Transcript — Step 2: Fire-and-forget (non-critical fields)
    this.eventEmitter.emit(TRANSCRIPT_EVENT, {
      runId: run.id,
      stdoutExcerpt: scrubSecrets(result.stdout.slice(0, 5000)),
      stderrExcerpt: scrubSecrets(result.stderr.slice(0, 2000)),
      usageJson: result.usage ?? null,
      sessionIdAfter: result.sessionIdAfter,
    });

    // Runtime state 업데이트 (에러 복구 캐스케이드 포함)
    const isFailed = status === 'failed' || status === 'timed_out';
    const prevFailCount = (agentWithRt as any)?.rtConsecutiveFailCount ?? 0;
    const newFailCount = isFailed ? prevFailCount + 1 : 0;

    const updatedAgent = await this.prisma.agentDefinition.update({
      where: { id: agentId },
      data: {
        rtSessionId: result.sessionIdAfter ?? (agentWithRt as any)?.rtSessionId,
        rtLastRunId: run.id,
        rtLastRunStatus: status,
        rtLastError: errorCode ? scrubSecrets(result.stderr.slice(0, 500)) : null,
        rtTotalInputTokens: { increment: result.usage?.inputTokens ?? 0 },
        rtTotalOutputTokens: { increment: result.usage?.outputTokens ?? 0 },
        rtTotalCostCents: { increment: result.usage?.costCents ?? 0 },
        rtConsecutiveFailCount: newFailCount,
        rtLastFailedAt: isFailed ? new Date() : (agentWithRt as any)?.rtLastFailedAt,
      } as any,
    });

    // 에러 복구 캐스케이드: 연속 3회 실패 시 자동 pause
    if ((updatedAgent as any).rtConsecutiveFailCount >= 3) {
      this.logger.error(
        `Agent ${agent.name} auto-paused: ${(updatedAgent as any).rtConsecutiveFailCount} consecutive failures`,
      );
      await this.prisma.agentDefinition.update({
        where: { id: agentId },
        data: {
          status: 'paused',
          pauseReason: `consecutive_failures(${(updatedAgent as any).rtConsecutiveFailCount})`,
          pausedAt: new Date(),
        },
      });

      this.eventEmitter.emit(
        AGENT_EVENTS.STATUS_CHANGED,
        new AgentStatusChangedEvent(agent.id, agent.name, 'paused', companyId, run.id),
      );
      this.eventEmitter.emit(
        AGENT_EVENTS.AUTO_PAUSED,
        new AgentAutoPausedEvent(
          agent.id, agent.name,
          (updatedAgent as any).rtConsecutiveFailCount,
          companyId,
          (updatedAgent as any).rtLastError ?? undefined,
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
        new AgentStatusChangedEvent(agent.id, agent.name, finalStatus as any, companyId, run.id),
      );
    }

    // Wakeup 완료
    await this.wakeupService.finish(wakeup.id, run.id, errorCode ? scrubSecrets(result.stderr.slice(0, 500)) : undefined);

    // Legacy AgentTask 동기화 — run() 경유로 생성된 task가 있으면 업데이트
    const payload = wakeup.payload as Record<string, unknown> | null;
    const legacyTaskId = payload?._legacy_task_id as string | undefined;
    if (legacyTaskId) {
      try {
        await this.prisma.agentTask.update({
          where: { id: legacyTaskId },
          data: {
            status: status === 'succeeded' ? 'completed' : 'failed',
            error: errorCode ? scrubSecrets(result.stderr.slice(0, 1000)) : null,
            completedAt: new Date(),
          },
        });
      } catch { /* task might not exist or already updated by callback */ }
    }

    this.logger.log(`Heartbeat finished: ${agent.name} (run=${run.id}, status=${status})`);

    return { runId: run.id, status };
  }

  // ── Timer 스케줄러 ──

  /**
   * 단일 에이전트의 cron 타이머를 교체하고 DB schedule을 업데이트.
   * syncTimers()와 달리 이 에이전트의 타이머만 교체하므로 다른 에이전트에 영향 없음.
   */
  async replaceAgentTimer(agentId: string, newSchedule: string): Promise<void> {
    // Cron 유효성 검사: 5개 필드 (분 시 일 월 요일) 또는 6개 필드 (초 포함)
    const cronRegex = /^(\S+\s+){4}\S+(\s+\S+)?$/;
    if (!cronRegex.test(newSchedule.trim())) {
      this.logger.warn(`replaceAgentTimer: invalid cron string "${newSchedule}" for agent ${agentId}`);
      return;
    }

    // 기존 타이머 제거
    const jobName = `heartbeat-timer-${agentId}`;
    try {
      this.schedulerRegistry.deleteCronJob(jobName);
    } catch { /* 기존 타이머 없는 경우 무시 */ }

    // DB에서 에이전트 정보 조회
    const agent = await this.prisma.agentDefinition.findUnique({ where: { id: agentId } });
    if (!agent) {
      this.logger.warn(`replaceAgentTimer: agent ${agentId} not found`);
      return;
    }

    // 새 타이머 등록
    try {
      const job = new CronJob(
        newSchedule,
        () => this.onTimerFire(agent.id, agent.companyId),
        null, true, 'Asia/Seoul',
      );
      this.schedulerRegistry.addCronJob(jobName, job);
      this.logger.log(`Timer replaced: ${agent.name} (${newSchedule})`);
    } catch (e) {
      this.logger.error(`replaceAgentTimer: invalid cron "${newSchedule}" for ${agent.name}: ${e}`);
      return;
    }

    // DB schedule 업데이트
    await this.prisma.agentDefinition.update({
      where: { id: agentId },
      data: { schedule: newSchedule },
    });
  }

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

  async runDailyCleanup(): Promise<void> {
    if (!this.resultCleanupService) return;
    try {
      const result = await this.resultCleanupService.cleanupAll();
      this.logger.log(`Daily cleanup: ${result.summarized} runs summarized`);
    } catch (err: any) {
      this.logger.error(`Daily cleanup failed: ${err.message}`);
    }
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

    let template = agent.promptTemplate;
    if (template.startsWith('agent-config/')) {
      template = await readFile(join(process.cwd(), template), 'utf-8');
    }

    let prompt = template;

    // 기본 변수 치환
    prompt = prompt
      .replace(/\{\{task_id\}\}/g, runId)
      .replace(/\{\{dry_run\}\}/g, dryRun)
      .replace(/\{\{db_url\}\}/g, dbUrl);

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
