import { z } from 'zod';

export const InteractionClassSchema = z.enum(['quick_ask', 'official_task']);
export type InteractionClass = z.infer<typeof InteractionClassSchema>;

export const InteractionPrincipalSchema = z
  .object({
    principalKey: z.string().min(8),
    userId: z.string().min(1),
    organizationId: z.string().min(1),
  })
  .strict();

export const AllowedAgentSchema = z
  .object({
    agentDefinitionKey: z.string().min(1),
    agentVersionId: z.string().min(1),
    displayName: z.string().min(1),
    description: z.string().min(1),
    isDefault: z.boolean(),
    supportsQuickAsk: z.boolean(),
  })
  .strict();

export const InteractionThreadTargetSchema = z
  .object({
    agentDefinitionKey: z.string().min(1),
    agentVersionId: z.string().min(1),
    copilotThreadId: z.string().uuid(),
    hasExplicitThreadId: z.boolean(),
    interactionClass: InteractionClassSchema,
    refreshAt: z.string().datetime().nullable(),
  })
  .strict();

const agentIdentity = (value: {
  agentDefinitionKey: string;
  agentVersionId: string;
}) => JSON.stringify([value.agentDefinitionKey, value.agentVersionId]);

export const InteractionBootstrapSchema = z
  .object({
    defaultAgentDefinitionKey: z.string().min(1),
    agents: z.array(AllowedAgentSchema).min(1),
    threadTargets: z.array(InteractionThreadTargetSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const defaults = value.agents.filter((agent) => agent.isDefault);
    if (
      defaults.length !== 1 ||
      defaults[0].agentDefinitionKey !== value.defaultAgentDefinitionKey
    ) {
      context.addIssue({
        code: 'custom',
        message: 'bootstrap requires exactly one matching default agent',
      });
    }

    const agentIdentities = value.agents.map(agentIdentity);
    const targetIdentities = value.threadTargets.map(agentIdentity);
    const allowedIdentitySet = new Set(agentIdentities);
    const targetIdentitySet = new Set(targetIdentities);
    if (
      allowedIdentitySet.size !== value.agents.length ||
      value.threadTargets.length !== value.agents.length ||
      targetIdentitySet.size !== value.threadTargets.length ||
      agentIdentities.some((identity) => !targetIdentitySet.has(identity)) ||
      targetIdentities.some((identity) => !allowedIdentitySet.has(identity))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'bootstrap requires exactly one target per allowed agent',
      });
    }
  });

export const CanonicalResourceRefSchema = z
  .object({
    kind: z.string().min(1),
    id: z.string().min(1),
    version: z.string().min(1).nullable(),
  })
  .strict();

export const DashboardContextSchema = z.object({
  routeKey: z.string().min(1),
  resourceRefs: z.array(CanonicalResourceRefSchema).max(50).default([]),
  filters: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
    )
    .default({}),
  visibleRowIds: z.array(z.string().min(1)).max(100).default([]),
  aggregateSummary: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .default({}),
  locale: z.string().min(2).max(20),
  timezone: z.string().min(1).max(64),
});

export const ThreadBindingSchema = z
  .object({
    id: z.string().min(1),
    copilotThreadId: z.string().min(1),
    organizationId: z.string().min(1),
    userId: z.string().min(1),
    agentVersionId: z.string().min(1),
    interactionClass: InteractionClassSchema,
    lifecycle: z.enum(['active', 'archived', 'deleted', 'legal_hold']),
    idleExpiresAt: z.string().datetime().nullable(),
    contextEpoch: z.number().int().positive(),
  })
  .strict();

export const AgentCorrelationSchema = z
  .object({
    copilotThreadId: z.string().min(1),
    aguiRunId: z.string().min(1),
    executionId: z.string().min(1),
    sessionId: z.string().min(1).nullable(),
    taskId: z.string().min(1).nullable(),
    operationsRunId: z.string().min(1).nullable(),
  })
  .strict();

export const AguiRunAuthorizationSchema = z
  .object({
    binding: ThreadBindingSchema,
    interactionClass: InteractionClassSchema,
    modelIdentity: z.string().min(1),
    runtimeType: z.string().min(1),
    policySnapshotId: z.string().min(1),
    dashboardContext: DashboardContextSchema,
  })
  .strict();

export const AguiThreadArchiveCommandSchema = z
  .object({
    threadId: z.string().uuid(),
    userId: z.string().min(8),
    agentId: z.string().min(1),
  })
  .strict();

export const AguiRunPreparationSchema = z
  .object({
    preparationToken: z.string().min(32),
    expiresAt: z.string().datetime(),
    copilotThreadId: z.string().uuid(),
    archive: AguiThreadArchiveCommandSchema.nullable(),
  })
  .strict();

export const AguiConnectionAuthorizationSchema = z
  .object({
    binding: ThreadBindingSchema,
    interactionClass: InteractionClassSchema,
    contextEpoch: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.binding.interactionClass !== value.interactionClass ||
      value.binding.contextEpoch !== value.contextEpoch
    ) {
      context.addIssue({
        code: 'custom',
        message: 'connection authorization must match its binding',
      });
    }
  });

export type InteractionPrincipal = z.infer<typeof InteractionPrincipalSchema>;
export type AllowedAgent = z.infer<typeof AllowedAgentSchema>;
export type InteractionThreadTarget = z.infer<typeof InteractionThreadTargetSchema>;
export type InteractionBootstrap = z.infer<typeof InteractionBootstrapSchema>;
export type ThreadBinding = z.infer<typeof ThreadBindingSchema>;
export type DashboardContext = z.infer<typeof DashboardContextSchema>;
export type AgentCorrelation = z.infer<typeof AgentCorrelationSchema>;
export type AguiRunPreparation = z.infer<typeof AguiRunPreparationSchema>;
export type AguiRunAuthorization = z.infer<typeof AguiRunAuthorizationSchema>;
export type AguiConnectionAuthorization = z.infer<
  typeof AguiConnectionAuthorizationSchema
>;
