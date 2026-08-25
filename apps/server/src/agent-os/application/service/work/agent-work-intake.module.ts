import { attemptRuntimeVersion } from '@kiditem/shared/agent-runtime';
import { AGENT_DEFINITIONS } from '../../../domain/agent-definition.registry';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type {
  AgentAttemptLaunchCapabilityPort,
} from '../../port/in/capability/agent-attempt-launch.capability.port';
import type {
  AgentWorkCommandPort,
} from '../../port/in/work/agent-work-command.port';
import {
  AgentWorkIntakeError,
  type AgentWorkIntakePort,
  type AgentWorkIntakePrincipal,
  type AgentWorkIntakeOutput,
} from '../../port/in/work/agent-work-intake.port';
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

/**
 * A deep application Module, not a Nest module. Incoming Adapters provide a
 * principal and coordinate; this Module retains all Agent Work intake policy.
 */
export class AgentWorkIntakeModule implements AgentWorkIntakePort {
  constructor(
    private readonly queries: Pick<
      AgentWorkQueryPort,
      'activeVersion' | 'taskVersion' | 'threadContinuation' | 'continuationContext'
    >,
    private readonly commands: Pick<AgentWorkCommandPort, 'root' | 'followUp'>,
    private readonly launch: AgentAttemptLaunchCapabilityPort,
    private readonly environment: NodeJS.ProcessEnv = process.env,
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

  async startThread(input: {
    principal: AgentWorkIntakePrincipal;
    sessionId: string;
    agentDefinitionKey: string;
    prompt: string;
    output: AgentWorkIntakeOutput;
  }): Promise<Pick<AdmitAttemptResult, 'attemptId' | 'sessionId' | 'taskId'>> {
    const agentDefinitionKey = this.supportedAgentDefinition(input.agentDefinitionKey);
    const rootContext = await this.activeLaunchContext(agentDefinitionKey);
    try {
      const admitted = await this.commands.root({
        organizationId: input.principal.organizationId,
        createdByUserId: input.principal.userId,
        assignedAgentVersionId: rootContext.version.id,
        objective: input.prompt,
        completionCriteria: 'Provide a concise durable result.',
        inputResourceRefs: [],
        input: { prompt: input.prompt },
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
      return { attemptId: admitted.attempt.id, sessionId: admitted.session.id, taskId: admitted.task.id };
    } catch (error) {
      if (!(error instanceof AgentOsRuntimeError) || error.code !== 'root_task_already_exists') throw error;
      const predecessor = await this.queries.threadContinuation({
        organizationId: input.principal.organizationId,
        userId: input.principal.userId,
        sessionId: input.sessionId,
      });
      if (!predecessor?.terminal) throw error;
      const successorContext = await this.taskLaunchContext(input.principal, input.sessionId, predecessor.taskId);
      const continuation = await this.queries.continuationContext({
        organizationId: input.principal.organizationId,
        userId: input.principal.userId,
        sessionId: input.sessionId,
        taskId: predecessor.taskId,
        prompt: input.prompt,
      });
      const admitted = await this.commands.followUp({
        organizationId: input.principal.organizationId,
        sessionId: input.sessionId,
        taskId: predecessor.taskId,
        requestedByUserId: input.principal.userId,
        predecessorAttemptId: predecessor.predecessorAttemptId,
        intent: 'follow_up',
        input: continuation.input,
        applicationVersion: successorContext.applicationVersion,
        authorizingGitSha: successorContext.authorizingGitSha,
        cliVersion: successorContext.cliVersion,
        reportedModel: successorContext.profile.model,
      });
      await this.launchAttempt({
        context: successorContext,
        attemptId: admitted.attemptId,
        sessionId: admitted.sessionId,
        taskId: admitted.taskId,
        principal: input.principal,
        prompt: continuation.prompt,
        output: input.output,
      });
      return admitted;
    }
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
): AgentWorkIntakePort {
  return new AgentWorkIntakeModule(queries, commands, launch);
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
