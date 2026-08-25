import { attemptRuntimeVersion } from '@kiditem/shared/agent-runtime';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { AGENT_DEFINITIONS } from '../../../domain/agent-definition.registry';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import {
  AgentWorkIntakeError,
  type AgentWorkIntakePort,
  type AgentWorkIntakePrincipal,
  type AgentWorkIntakeOutput,
  type AgentWorkThreadAdmission,
} from '../../port/in/work/agent-work-intake.port';
import type {
  AgentAttemptLaunchCapabilityPort,
} from '../../port/in/capability/agent-attempt-launch.capability.port';
import type {
  AgentWorkCommandPort,
} from '../../port/in/work/agent-work-command.port';
import type { LiveAttemptOutputCapabilityPort } from '../../port/in/capability/live-attempt-output.capability.port';
import type {
  AgentWorkQueryPort,
} from '../../port/in/work/agent-work-query.port';
import type {
  AdmitAttemptResult,
  AdmitRootAttemptResult,
} from '../../port/out/work/agent-work-persistence.types';

type AgentVersion = NonNullable<Awaited<ReturnType<AgentWorkQueryPort['activeVersion']>>>;

type LaunchContext = Readonly<{
  version: AgentVersion;
  runtime: 'codex_cli' | 'claude_cli';
  profile: { model: string };
  applicationVersion: string;
  authorizingGitSha: string;
  cliVersion: string;
}>;

type AgentLiveMessageSender = Readonly<{
  send(input: {
    organizationId: string;
    requestedByUserId: string;
    sessionId: string;
    taskId: string;
    attemptId: string;
    content: string;
    turnId: string;
  }): Promise<void>;
}>;

type ThreadContinuation = NonNullable<Awaited<ReturnType<AgentWorkQueryPort['threadContinuation']>>>;
type ThreadInput = Readonly<{
  principal: AgentWorkIntakePrincipal;
  sessionId: string;
  agentDefinitionKey: string;
  prompt: string;
  messageCommandKey: string;
  output: AgentWorkIntakeOutput;
}>;
type RootAdmissionReceipt = NonNullable<ThreadContinuation['rootAdmission']>;

const MAX_IN_FLIGHT_ROOT_THREADS = 256;

type InFlightRootThread = Readonly<{
  inputHash: string;
  promise: Promise<AgentWorkThreadAdmission>;
}>;

/**
 * A deep application Module, not a Nest module. Incoming Adapters provide a
 * principal and coordinate; this Module retains all Agent Work intake policy.
 */
export class AgentWorkIntakeModule implements AgentWorkIntakePort {
  private readonly rootThreadAdmissions = new Map<string, InFlightRootThread>();

  constructor(
    private readonly queries: Pick<
      AgentWorkQueryPort,
      'activeVersion' | 'taskVersion' | 'threadContinuation' | 'continuationContext'
    >,
    private readonly commands: Pick<AgentWorkCommandPort, 'root' | 'followUp'>,
    private readonly launch: AgentAttemptLaunchCapabilityPort,
    private readonly environment: NodeJS.ProcessEnv,
    private readonly liveMessages: AgentLiveMessageSender,
    private readonly liveOutput: Pick<LiveAttemptOutputCapabilityPort, 'bind' | 'closeUnboundOutput'>,
  ) {}

  async startRoot(input: {
    principal: AgentWorkIntakePrincipal;
    objective: string;
    completionCriteria?: string;
    input?: unknown;
    sessionId?: string;
  }): Promise<AdmitRootAttemptResult> {
    const context = await this.activeLaunchContext('operator');
    const admitted = await this.commands.root({
      organizationId: input.principal.organizationId,
      createdByUserId: input.principal.userId,
      assignedAgentVersionId: context.version.id,
      objective: input.objective,
      completionCriteria: input.completionCriteria ?? 'Provide a concise durable result.',
      inputResourceRefs: [],
      input: input.input ?? { prompt: input.objective },
      applicationVersion: context.applicationVersion,
      authorizingGitSha: context.authorizingGitSha,
      cliVersion: context.cliVersion,
      reportedModel: context.profile.model,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
    await this.launchAttempt({
      context,
      attemptId: admitted.attempt.id,
      sessionId: admitted.session.id,
      taskId: admitted.task.id,
      principal: input.principal,
      prompt: input.objective,
    });
    return admitted;
  }

  async continue(input: {
    principal: AgentWorkIntakePrincipal;
    sessionId: string;
    taskId: string;
    predecessorAttemptId: string;
    prompt: string;
    reopen?: boolean;
  }): Promise<AdmitAttemptResult> {
    const context = await this.taskLaunchContext(input.principal, input.sessionId, input.taskId);
    const continuation = await this.queries.continuationContext({
      organizationId: input.principal.organizationId,
      userId: input.principal.userId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      prompt: input.prompt,
    });
    const admitted = await this.commands.followUp({
      organizationId: input.principal.organizationId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      requestedByUserId: input.principal.userId,
      predecessorAttemptId: input.predecessorAttemptId,
      intent: input.reopen ? 'reopen' : 'follow_up',
      input: continuation.input,
      applicationVersion: context.applicationVersion,
      authorizingGitSha: context.authorizingGitSha,
      cliVersion: context.cliVersion,
      reportedModel: context.profile.model,
    });
    await this.launchAttempt({
      context,
      attemptId: admitted.attemptId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      principal: input.principal,
      prompt: continuation.prompt,
    });
    return admitted;
  }

  async startThread(input: ThreadInput): Promise<AgentWorkThreadAdmission> {
    const agentDefinitionKey = this.supportedAgentDefinition(input.agentDefinitionKey);
    const rootReceipt = rootAdmissionReceipt(input, agentDefinitionKey);
    const key = rootThreadAdmissionKey(input);
    const existing = this.rootThreadAdmissions.get(key);
    if (existing) {
      if (existing.inputHash !== rootReceipt.inputHash) {
        return Promise.reject(new AgentWorkIntakeError('root_admission_replay_conflict'));
      }
      return existing.promise.then(() => this.rebindCoalescedRoot(input, agentDefinitionKey, rootReceipt));
    }
    if (this.rootThreadAdmissions.size >= MAX_IN_FLIGHT_ROOT_THREADS) {
      return Promise.reject(new AgentWorkIntakeError('root_admission_in_flight_limit'));
    }
    let admission!: Promise<AgentWorkThreadAdmission>;
    admission = Promise.resolve()
      .then(() => this.startThreadOnce(input, agentDefinitionKey, rootReceipt))
      .finally(() => {
        if (this.rootThreadAdmissions.get(key)?.promise === admission) {
          this.rootThreadAdmissions.delete(key);
        }
      });
    this.rootThreadAdmissions.set(key, { inputHash: rootReceipt.inputHash, promise: admission });
    return admission;
  }

  private async startThreadOnce(
    input: ThreadInput,
    agentDefinitionKey: string,
    rootReceipt: Pick<RootAdmissionReceipt, 'messageCommandKey' | 'inputHash'>,
  ): Promise<AgentWorkThreadAdmission> {
    const existing = await this.queries.threadContinuation({
      organizationId: input.principal.organizationId,
      userId: input.principal.userId,
      sessionId: input.sessionId,
    });
    if (existing) return this.resolveThreadAdmission(input, agentDefinitionKey, existing, rootReceipt);

    try {
      const rootContext = await this.activeLaunchContext(agentDefinitionKey);
      const admitted = await this.commands.root({
        organizationId: input.principal.organizationId,
        createdByUserId: input.principal.userId,
        assignedAgentVersionId: rootContext.version.id,
        objective: input.prompt,
        completionCriteria: 'Provide a concise durable result.',
        inputResourceRefs: [],
        input: { prompt: input.prompt, rootAdmission: rootReceipt },
        sessionId: input.sessionId,
        applicationVersion: rootContext.applicationVersion,
        authorizingGitSha: rootContext.authorizingGitSha,
        cliVersion: rootContext.cliVersion,
        reportedModel: rootContext.profile.model,
      });
      await this.launchAttempt({
        context: rootContext,
        attemptId: admitted.attempt.id,
        sessionId: admitted.session.id,
        taskId: admitted.task.id,
        principal: input.principal,
        prompt: input.prompt,
        output: input.output,
      });
      return {
        kind: 'root',
        attemptId: admitted.attempt.id,
        sessionId: admitted.session.id,
        taskId: admitted.task.id,
      };
    } catch (error) {
      if (!(error instanceof AgentOsRuntimeError) || error.code !== 'root_task_already_exists') throw error;
      const predecessor = await this.queries.threadContinuation({
        organizationId: input.principal.organizationId,
        userId: input.principal.userId,
        sessionId: input.sessionId,
      });
      if (!predecessor) throw error;
      return this.resolveThreadAdmission(input, agentDefinitionKey, predecessor, rootReceipt, error);
    }
  }

  private async rebindCoalescedRoot(
    input: ThreadInput,
    agentDefinitionKey: string,
    rootReceipt: Pick<RootAdmissionReceipt, 'messageCommandKey' | 'inputHash'>,
  ): Promise<AgentWorkThreadAdmission> {
    const predecessor = await this.queries.threadContinuation({
      organizationId: input.principal.organizationId,
      userId: input.principal.userId,
      sessionId: input.sessionId,
    });
    if (!predecessor) throw new AgentWorkIntakeError('root_admission_replay_missing');
    return this.resolveThreadAdmission(input, agentDefinitionKey, predecessor, rootReceipt);
  }

  private async resolveThreadAdmission(
    input: ThreadInput,
    agentDefinitionKey: string,
    predecessor: ThreadContinuation,
    rootReceipt: Pick<RootAdmissionReceipt, 'messageCommandKey' | 'inputHash'>,
    rootCollision?: AgentOsRuntimeError,
  ): Promise<AgentWorkThreadAdmission> {
    const durableRoot = predecessor.rootAdmission;
    if (durableRoot?.messageCommandKey === rootReceipt.messageCommandKey) {
      if (
        durableRoot.inputHash !== rootReceipt.inputHash
        || predecessor.agentDefinitionKey !== agentDefinitionKey
      ) throw new AgentWorkIntakeError('root_admission_replay_conflict');
      return this.rebindRootAdmission(input, durableRoot);
    }
    // A collision without a readable receipt cannot prove that the initial
    // prompt was not already admitted. Do not turn it into a live command.
    if (rootCollision && !durableRoot) throw rootCollision;
    return this.submitExistingThread(input, agentDefinitionKey, predecessor);
  }

  private rebindRootAdmission(
    input: ThreadInput,
    rootAdmission: RootAdmissionReceipt,
  ): AgentWorkThreadAdmission {
    if (rootAdmission.terminal) {
      this.liveOutput.closeUnboundOutput(input.output);
    } else {
      this.liveOutput.bind({ attemptId: rootAdmission.attemptId, ...input.output });
    }
    return {
      kind: 'root',
      attemptId: rootAdmission.attemptId,
      sessionId: input.sessionId,
      taskId: rootAdmission.taskId,
    };
  }

  private async submitExistingThread(
    input: ThreadInput,
    agentDefinitionKey: string,
    predecessor: ThreadContinuation,
  ): Promise<AgentWorkThreadAdmission> {
    if (predecessor.agentDefinitionKey !== agentDefinitionKey) {
      throw new AgentWorkIntakeError('agent_thread_agent_mismatch');
    }
    if (!predecessor.terminal) {
      // The sender rechecks the exact Session/Task/Attempt/user/live fence and
      // resolves only after the Runner command queue accepted attempt.input.
      try {
        await this.liveMessages.send({
          organizationId: input.principal.organizationId,
          requestedByUserId: input.principal.userId,
          sessionId: input.sessionId,
          taskId: predecessor.taskId,
          attemptId: predecessor.predecessorAttemptId,
          content: input.prompt,
          turnId: input.messageCommandKey,
        });
      } catch (error) {
        // A terminal event may win between the authoritative read and the
        // Runner queue admission. Re-read once only to report that durable
        // terminal fact; a browser message never creates a new Attempt.
        if (error instanceof AgentOsRuntimeError && error.code === 'attempt_not_live') {
          const latest = await this.queries.threadContinuation({
            organizationId: input.principal.organizationId,
            userId: input.principal.userId,
            sessionId: input.sessionId,
          });
          if (latest?.terminal) {
            this.liveOutput.closeUnboundOutput(input.output);
            throw new AgentWorkIntakeError('agent_thread_terminal');
          }
        }
        throw error;
      }
      // Rebind only after enqueue ACK. If a terminal event won this narrow
      // interval, the channel closes the pending stream instead. The input
      // remains its original live admission: it may already have reached the
      // Runner, so creating another Attempt here would duplicate user work.
      this.liveOutput.bind({
        attemptId: predecessor.predecessorAttemptId,
        threadId: input.output.threadId,
        runId: input.output.runId,
      });
      return {
        kind: 'live_input',
        attemptId: predecessor.predecessorAttemptId,
        sessionId: input.sessionId,
        taskId: predecessor.taskId,
      };
    }
    this.liveOutput.closeUnboundOutput(input.output);
    throw new AgentWorkIntakeError('agent_thread_terminal');
  }

  private async activeLaunchContext(agentDefinitionKey: string): Promise<LaunchContext> {
    const version = await this.queries.activeVersion(agentDefinitionKey);
    if (!version) {
      throw new AgentWorkIntakeError(
        agentDefinitionKey === 'operator' ? 'operator_agent_version_not_found' : 'agent_version_not_found',
      );
    }
    return this.launchContext(version);
  }

  private async taskLaunchContext(
    principal: AgentWorkIntakePrincipal,
    sessionId: string,
    taskId: string,
  ): Promise<LaunchContext> {
    const version = await this.queries.taskVersion({
      organizationId: principal.organizationId,
      userId: principal.userId,
      sessionId,
      taskId,
    });
    if (!version) throw new AgentWorkIntakeError('agent_version_not_found');
    return this.launchContext(version);
  }

  private launchContext(version: AgentVersion): LaunchContext {
    const agentDefinitionKey = this.supportedAgentDefinition(version.agentDefinitionKey);
    const runtime = supportedRuntime(version.runtimeType);
    const applicationVersion = requiredEnvironment(this.environment, 'KIDITEM_APPLICATION_VERSION');
    const authorizingGitSha = requiredEnvironment(this.environment, 'KIDITEM_GIT_SHA');
    const model = requiredEnvironment(this.environment, `AGENT_${agentDefinitionKey.toUpperCase()}_MODEL`);
    return {
      version,
      runtime,
      profile: { model },
      applicationVersion,
      authorizingGitSha,
      cliVersion: attemptRuntimeVersion(runtime),
    };
  }

  private async launchAttempt(input: {
    context: LaunchContext;
    attemptId: string;
    sessionId: string;
    taskId: string;
    principal: AgentWorkIntakePrincipal;
    prompt: string;
    output?: AgentWorkIntakeOutput;
  }): Promise<void> {
    await this.launch.start({
      attemptId: input.attemptId,
      runtime: input.context.runtime,
      profile: input.context.profile,
      prompt: input.prompt,
      instructionProfileRef: input.context.version.instructionProfileRef,
      sessionId: input.sessionId,
      taskId: input.taskId,
      agentVersionId: input.context.version.id,
      organizationId: input.principal.organizationId,
      userId: input.principal.userId,
      capabilityKeys: capabilityKeys(input.context.version.capabilityKeys),
      ...(input.output ? { output: input.output } : {}),
    });
  }

  private supportedAgentDefinition(value: string): string {
    if (!AGENT_DEFINITIONS.some((definition) => definition.key === value)) {
      throw new AgentWorkIntakeError('agent_definition_not_supported');
    }
    return value;
  }
}

/** Pure root-composition factory for the AGENT_WORK_INTAKE_PORT provider. */
export function createAgentWorkIntake(
  queries: AgentWorkQueryPort,
  commands: AgentWorkCommandPort,
  launch: AgentAttemptLaunchCapabilityPort,
  liveMessages: AgentLiveMessageSender,
  liveOutput: Pick<LiveAttemptOutputCapabilityPort, 'bind' | 'closeUnboundOutput'>,
): AgentWorkIntakePort {
  return new AgentWorkIntakeModule(queries, commands, launch, process.env, liveMessages, liveOutput);
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`missing_required_configuration:${name}`);
  return value;
}

function supportedRuntime(value: string): 'codex_cli' | 'claude_cli' {
  if (value !== 'codex_cli' && value !== 'claude_cli') throw new Error('attempt_runtime_not_supported');
  return value;
}

function capabilityKeys(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [];
}

function rootAdmissionReceipt(
  input: Pick<ThreadInput, 'messageCommandKey' | 'prompt'>,
  agentDefinitionKey: string,
): Pick<RootAdmissionReceipt, 'messageCommandKey' | 'inputHash'> {
  return {
    messageCommandKey: input.messageCommandKey,
    inputHash: canonicalOwnerInputHash({ agentDefinitionKey, prompt: input.prompt }),
  };
}

function rootThreadAdmissionKey(input: ThreadInput): string {
  return [
    input.principal.organizationId,
    input.principal.userId,
    input.sessionId,
    input.messageCommandKey,
  ].join('\u0000');
}
