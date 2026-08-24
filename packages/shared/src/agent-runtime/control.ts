import { z } from 'zod';
import { AgentResultEnvelopeSchema } from '../agent-interaction';
import {
  AgentCliRuntimeSchema,
  ATTEMPT_RUNTIME_TRAIN,
  RunnerPlatformSchema,
} from './runtime-train';

export const MAX_RUNNER_COMMANDS = 8;
export const MAX_RUNNER_EVENTS = 32;
export const MAX_RUNNER_OUTPUT_BYTES = 128 * 1024;

const UuidSchema = z.string().uuid();
const CommandHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const PositiveSafeIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const OpaqueBearerSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const LoopbackHttpUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'http:' &&
        (url.hostname === '127.0.0.1' || url.hostname === '[::1]') &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, 'loopback_http_url_required');

const FORBIDDEN_RUNNER_INGRESS_PROPERTY_NAMES = new Set([
  'command',
  'executable',
  'shell',
  'args',
  'env',
  'cwd',
  'path',
  'loginhome',
  'organization',
  'organizationid',
  'organizationauthority',
  'user',
  'userid',
  'userauthority',
  'session',
  'sessionid',
  'sessionauthority',
]);

const ACTIVE_SECRET_WORDS = new Set([
  'secret',
  'credential',
  'credentials',
  'password',
  'passphrase',
]);
const ACTIVE_SECRET_COMPOSITES = [
  'accesstoken',
  'bearertoken',
  'oauthtoken',
  'apitoken',
  'apikey',
  'privatekey',
  'connectionstring',
  'connectionurl',
  'connectiondsn',
];

function propertyNameWords(propertyName: string): string[] {
  return propertyName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function isActiveSecretOrCredentialPropertyName(propertyName: string): boolean {
  const normalized = propertyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    propertyNameWords(propertyName).some((word) => ACTIVE_SECRET_WORDS.has(word)) ||
    ACTIVE_SECRET_COMPOSITES.some((composite) => normalized.includes(composite))
  );
}

function controlPropertyNameIsForbidden(propertyName: string): boolean {
  const normalized = propertyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    FORBIDDEN_RUNNER_INGRESS_PROPERTY_NAMES.has(normalized) ||
    isActiveSecretOrCredentialPropertyName(propertyName)
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function rejectForbiddenControlProperties(value: unknown, context: z.RefinementCtx): void {
  const visited = new Set<object>();
  const visit = (node: unknown, path: Array<string | number>): void => {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, [...path, index]));
      return;
    }

    for (const [propertyName, propertyValue] of Object.entries(node)) {
      if (controlPropertyNameIsForbidden(propertyName)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, propertyName],
          message: 'forbidden_control_property_name',
        });
      }
      visit(propertyValue, [...path, propertyName]);
    }
  };
  visit(value, []);
}

function guardControlPayload<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine(rejectForbiddenControlProperties);
}

const RuntimeReadinessSchema = z
  .object({
    version: z.string().min(1).max(32),
    loginVerified: z.literal(true),
    nonPersistentSettingsVerified: z.literal(true),
  })
  .strict();

const ExactRuntimeReadinessSchema = z
  .object({
    codex_cli: RuntimeReadinessSchema.extend({
      version: z.literal(ATTEMPT_RUNTIME_TRAIN.codexVersion),
    }).strict(),
    claude_cli: RuntimeReadinessSchema.extend({
      version: z.literal(ATTEMPT_RUNTIME_TRAIN.claudeVersion),
    }).strict(),
  })
  .strict();

const RunnerHelloObjectSchema = z
  .object({
    kind: z.literal('hello'),
    runnerInstanceId: UuidSchema,
    platform: RunnerPlatformSchema,
    nodeMajor: z.literal(ATTEMPT_RUNTIME_TRAIN.nodeMajor),
    controlRevision: z.literal(ATTEMPT_RUNTIME_TRAIN.controlRevision),
    mcpProtocolRevision: z.literal(ATTEMPT_RUNTIME_TRAIN.mcpProtocolRevision),
    cliContractIdentity: z.literal(ATTEMPT_RUNTIME_TRAIN.cliContractIdentity),
    runtimes: ExactRuntimeReadinessSchema,
  })
  .strict();

export const RunnerHelloSchema = guardControlPayload(RunnerHelloObjectSchema);
export type RunnerHello = z.infer<typeof RunnerHelloSchema>;

const RunnerPollObjectSchema = z
  .object({
    kind: z.literal('poll'),
    runnerInstanceId: UuidSchema,
    leaseId: UuidSchema,
  })
  .strict();

export const RunnerPollSchema = guardControlPayload(RunnerPollObjectSchema);
export type RunnerPoll = z.infer<typeof RunnerPollSchema>;

export const RunnerPollRequestSchema = guardControlPayload(
  z.discriminatedUnion('kind', [RunnerHelloObjectSchema, RunnerPollObjectSchema]),
);
export type RunnerPollRequest = z.infer<typeof RunnerPollRequestSchema>;

const RunnerLeaseResponseObjectSchema = z
  .object({
    runnerInstanceId: UuidSchema,
    leaseId: UuidSchema,
    status: z.enum(['probing', 'ready']),
    leaseTtlMs: z.literal(30_000),
    controlRevision: z.literal(ATTEMPT_RUNTIME_TRAIN.controlRevision),
  })
  .strict();

export const RunnerLeaseResponseSchema = guardControlPayload(RunnerLeaseResponseObjectSchema);
export type RunnerLeaseResponse = z.infer<typeof RunnerLeaseResponseSchema>;

const AttemptLaunchSpecObjectSchema = z
  .object({
    attemptId: UuidSchema,
    runtime: AgentCliRuntimeSchema,
    model: z.string().trim().min(1).max(256),
    prompt: z.string().min(1).max(24_000),
    workspacePolicy: z.literal('empty_ephemeral_v1'),
    timeoutMs: z.number().int().min(1_000).max(30 * 60_000),
    mcpUrl: LoopbackHttpUrlSchema,
    attemptToken: OpaqueBearerSchema,
    mcpProtocolRevision: z.literal(ATTEMPT_RUNTIME_TRAIN.mcpProtocolRevision),
    cliContractIdentity: z.literal(ATTEMPT_RUNTIME_TRAIN.cliContractIdentity),
  })
  .strict();

export const AttemptLaunchSpecSchema = guardControlPayload(AttemptLaunchSpecObjectSchema);
export type AttemptLaunchSpec = z.infer<typeof AttemptLaunchSpecSchema>;

const RunnerCommandBaseSchema = z
  .object({
    commandId: UuidSchema,
    attemptId: UuidSchema,
    deadlineAt: z.string().datetime({ offset: true }),
    commandHash: CommandHashSchema,
  })
  .strict();

const RunnerStartCommandObjectSchema = RunnerCommandBaseSchema.extend({
  kind: z.literal('attempt.start'),
  launch: AttemptLaunchSpecObjectSchema,
}).strict();

function rejectMismatchedStartAttemptId(
  command: z.infer<typeof RunnerStartCommandObjectSchema>,
  context: z.RefinementCtx,
): void {
  if (command.launch.attemptId !== command.attemptId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['launch', 'attemptId'],
      message: 'command_attempt_id_mismatch',
    });
  }
}

const RunnerInputCommandObjectSchema = RunnerCommandBaseSchema.extend({
  kind: z.literal('attempt.input'),
  input: z.string().min(1).max(24_000),
}).strict();

const RunnerInterruptCommandObjectSchema = RunnerCommandBaseSchema.extend({
  kind: z.literal('attempt.interrupt'),
}).strict();

export const RunnerStartCommandSchema = guardControlPayload(
  RunnerStartCommandObjectSchema.superRefine(rejectMismatchedStartAttemptId),
);
export type RunnerStartCommand = z.infer<typeof RunnerStartCommandSchema>;

export const RunnerInputCommandSchema = guardControlPayload(RunnerInputCommandObjectSchema);
export type RunnerInputCommand = z.infer<typeof RunnerInputCommandSchema>;

export const RunnerInterruptCommandSchema = guardControlPayload(RunnerInterruptCommandObjectSchema);
export type RunnerInterruptCommand = z.infer<typeof RunnerInterruptCommandSchema>;

const RunnerCommandObjectSchema = z.discriminatedUnion('kind', [
  RunnerStartCommandObjectSchema,
  RunnerInputCommandObjectSchema,
  RunnerInterruptCommandObjectSchema,
]);

export const RunnerCommandSchema = guardControlPayload(
  RunnerCommandObjectSchema.superRefine((command, context) => {
    if (command.kind === 'attempt.start') {
      rejectMismatchedStartAttemptId(command, context);
    }
  }),
);
export type RunnerCommand = z.infer<typeof RunnerCommandSchema>;

const RunnerCommandBatchObjectSchema = z
  .object({
    commands: z.array(RunnerCommandObjectSchema).max(MAX_RUNNER_COMMANDS),
  })
  .strict()
  .superRefine((batch, context) => {
    batch.commands.forEach((command, index) => {
      if (command.kind === 'attempt.start' && command.launch.attemptId !== command.attemptId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['commands', index, 'launch', 'attemptId'],
          message: 'command_attempt_id_mismatch',
        });
      }
    });
  });

export const RunnerCommandBatchSchema = guardControlPayload(RunnerCommandBatchObjectSchema);
export type RunnerCommandBatch = z.infer<typeof RunnerCommandBatchSchema>;

const BoundedOutputSchema = z
  .string()
  .min(1)
  .max(MAX_RUNNER_OUTPUT_BYTES)
  .superRefine((output, context) => {
    if (byteLength(output) > MAX_RUNNER_OUTPUT_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'runner_output_too_large',
      });
    }
  });

const CommandAcknowledgementEventObjectSchema = z
  .object({
    kind: z.literal('command_ack'),
    commandId: UuidSchema,
    attemptId: UuidSchema,
    commandHash: CommandHashSchema,
  })
  .strict();

const AttemptStartedEventObjectSchema = z
  .object({
    kind: z.literal('attempt.started'),
    attemptId: UuidSchema,
  })
  .strict();

const AttemptOutputEventObjectSchema = z
  .object({
    kind: z.literal('attempt.output'),
    attemptId: UuidSchema,
    output: BoundedOutputSchema,
  })
  .strict();

const AttemptTerminalEventObjectSchema = z
  .object({
    kind: z.literal('attempt.terminal'),
    attemptId: UuidSchema,
    terminalReason: z.enum([
      'success',
      'protocol_success',
      'nonzero_exit',
      'runtime_error',
      'timeout',
      'interrupted',
    ]),
    result: AgentResultEnvelopeSchema.optional(),
  })
  .strict();

const AttemptRejectedEventObjectSchema = z
  .object({
    kind: z.literal('attempt.rejected'),
    commandId: UuidSchema,
    attemptId: UuidSchema,
    code: z.enum(['conflict', 'invalid_state', 'unsupported']),
  })
  .strict();

export const RunnerEventSchema = guardControlPayload(
  z.discriminatedUnion('kind', [
    CommandAcknowledgementEventObjectSchema,
    AttemptStartedEventObjectSchema,
    AttemptOutputEventObjectSchema,
    AttemptTerminalEventObjectSchema,
    AttemptRejectedEventObjectSchema,
  ]),
);
export type RunnerEvent = z.infer<typeof RunnerEventSchema>;

const RunnerEventBatchObjectSchema = z
  .object({
    runnerInstanceId: UuidSchema,
    leaseId: UuidSchema,
    eventSeq: PositiveSafeIntegerSchema,
    events: z
      .array(
        z.discriminatedUnion('kind', [
          CommandAcknowledgementEventObjectSchema,
          AttemptStartedEventObjectSchema,
          AttemptOutputEventObjectSchema,
          AttemptTerminalEventObjectSchema,
          AttemptRejectedEventObjectSchema,
        ]),
      )
      .min(1)
      .max(MAX_RUNNER_EVENTS),
  })
  .strict()
  .superRefine((batch, context) => {
    const outputBytes = batch.events.reduce(
      (total, event) => total + (event.kind === 'attempt.output' ? byteLength(event.output) : 0),
      0,
    );
    if (outputBytes > MAX_RUNNER_OUTPUT_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['events'],
        message: 'runner_output_batch_too_large',
      });
    }
  });

export const RunnerEventBatchSchema = guardControlPayload(RunnerEventBatchObjectSchema);
export type RunnerEventBatch = z.infer<typeof RunnerEventBatchSchema>;

const RunnerEventAcknowledgementObjectSchema = z
  .object({
    eventSeq: PositiveSafeIntegerSchema,
    accepted: z.literal(true),
  })
  .strict();

export const RunnerEventAcknowledgementSchema = guardControlPayload(
  RunnerEventAcknowledgementObjectSchema,
);
export type RunnerEventAcknowledgement = z.infer<typeof RunnerEventAcknowledgementSchema>;
