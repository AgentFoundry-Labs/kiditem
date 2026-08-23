import { z } from "zod";

const logicalIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;
const agentDefinitionKeyPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const logicalIdentifierSource = "[A-Za-z0-9][A-Za-z0-9._~-]*";
const agentDefinitionKeySource = "[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*";
const positiveDecimalSequenceSource = "[1-9][0-9]*";

const logicalIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(logicalIdentifierPattern);

export const OwnerIdSchema = logicalIdentifierSchema.brand<"OwnerId">();
export const LogicalIdSchema = logicalIdentifierSchema.brand<"LogicalId">();
export const OrganizationIdSchema =
  logicalIdentifierSchema.brand<"OrganizationId">();
export const UserIdSchema = logicalIdentifierSchema.brand<"UserId">();
export const AgentSessionIdSchema =
  logicalIdentifierSchema.brand<"AgentSessionId">();
export const AgentSessionTaskIdSchema =
  logicalIdentifierSchema.brand<"AgentSessionTaskId">();
export const AgentExecutionIdSchema =
  logicalIdentifierSchema.brand<"AgentExecutionId">();
export const AgentExecutionAttemptIdSchema =
  logicalIdentifierSchema.brand<"AgentExecutionAttemptId">();
export const AgentAttemptIdSchema =
  logicalIdentifierSchema.brand<"AgentAttemptId">();
export const AgentCapabilityInvocationIdSchema =
  logicalIdentifierSchema.brand<"AgentCapabilityInvocationId">();
export const AgentCapabilityApprovalIdSchema =
  logicalIdentifierSchema.brand<"AgentCapabilityApprovalId">();
export const OperationRunIdSchema =
  logicalIdentifierSchema.brand<"OperationRunId">();

export const AgentDefinitionKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(agentDefinitionKeyPattern)
  .brand<"AgentDefinitionKey">();

export const AgentVersionKeySchema =
  logicalIdentifierSchema.brand<"AgentVersionKey">();

export const CopilotThreadIdSchema = z
  .string()
  .min(1)
  .max(256)
  .brand<"CopilotThreadId">();
export const AguiRunIdSchema = z.string().min(1).max(256).brand<"AguiRunId">();
export const ToolCallIdSchema = z
  .string()
  .min(1)
  .max(256)
  .brand<"ToolCallId">();
export const RequestIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  .brand<"RequestId">();
export const IdempotencyKeySchema = z
  .string()
  .min(1)
  .max(256)
  .brand<"IdempotencyKey">();
export const PositiveDecimalSequenceSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .brand<"PositiveDecimalSequence">();
export const NonNegativeDecimalSequenceSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/)
  .brand<"NonNegativeDecimalSequence">();
export const OpaqueReplayCursorSchema = z
  .string()
  .min(16)
  .max(4096)
  .brand<"OpaqueReplayCursor">();
export const OpaqueShortLivedTokenSchema = z
  .string()
  .min(32)
  .max(4096)
  .brand<"OpaqueShortLivedToken">();
export const Sha256DigestSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .brand<"Sha256Digest">();

export const OrganizationNameSchema = z
  .string()
  .regex(new RegExp(`^organizations/${logicalIdentifierSource}$`))
  .brand<"OrganizationName">();
export const UserNameSchema = z
  .string()
  .regex(new RegExp(`^users/${logicalIdentifierSource}$`))
  .brand<"UserName">();
export const AgentDefinitionNameSchema = z
  .string()
  .regex(new RegExp(`^agentDefinitions/${agentDefinitionKeySource}$`))
  .brand<"AgentDefinitionName">();
export const AgentVersionNameSchema = z
  .string()
  .regex(
    new RegExp(
      `^agentDefinitions/${agentDefinitionKeySource}/versions/${logicalIdentifierSource}$`,
    ),
  )
  .brand<"AgentVersionName">();
export const AgentSessionNameSchema = z
  .string()
  .regex(
    new RegExp(
      `^organizations/${logicalIdentifierSource}/agentSessions/${logicalIdentifierSource}$`,
    ),
  )
  .brand<"AgentSessionName">();
export const AgentSessionTaskNameSchema = z
  .string()
  .regex(
    new RegExp(
      `^organizations/${logicalIdentifierSource}/agentSessions/${logicalIdentifierSource}/tasks/${logicalIdentifierSource}$`,
    ),
  )
  .brand<"AgentSessionTaskName">();
export const AgentExecutionNameSchema = z
  .string()
  .regex(
    new RegExp(
      `^organizations/${logicalIdentifierSource}/agentSessions/${logicalIdentifierSource}/executions/${logicalIdentifierSource}$`,
    ),
  )
  .brand<"AgentExecutionName">();
export const AgentExecutionAttemptNameSchema = z
  .string()
  .regex(
    new RegExp(
      `^organizations/${logicalIdentifierSource}/agentSessions/${logicalIdentifierSource}/executions/${logicalIdentifierSource}/attempts/${logicalIdentifierSource}$`,
    ),
  )
  .brand<"AgentExecutionAttemptName">();
export const AgentConversationEventNameSchema = z
  .string()
  .regex(
    new RegExp(
      `^organizations/${logicalIdentifierSource}/agentSessions/${logicalIdentifierSource}/events/${positiveDecimalSequenceSource}$`,
    ),
  )
  .brand<"AgentConversationEventName">();
export const OperationRunNameSchema = z
  .string()
  .regex(
    new RegExp(
      `^organizations/${logicalIdentifierSource}/operations/${logicalIdentifierSource}$`,
    ),
  )
  .brand<"OperationRunName">();
export const OperationCheckpointNameSchema = z
  .string()
  .regex(
    new RegExp(
      `^organizations/${logicalIdentifierSource}/operations/${logicalIdentifierSource}/checkpoints/${positiveDecimalSequenceSource}$`,
    ),
  )
  .brand<"OperationCheckpointName">();

const organizationNamePattern = new RegExp(
  `^organizations/(${logicalIdentifierSource})$`,
);
const userNamePattern = new RegExp(`^users/(${logicalIdentifierSource})$`);
const agentDefinitionNamePattern = new RegExp(
  `^agentDefinitions/(${agentDefinitionKeySource})$`,
);
const agentVersionNamePattern = new RegExp(
  `^agentDefinitions/(${agentDefinitionKeySource})/versions/(${logicalIdentifierSource})$`,
);
const agentSessionNamePattern = new RegExp(
  `^organizations/(${logicalIdentifierSource})/agentSessions/(${logicalIdentifierSource})$`,
);
const agentSessionTaskNamePattern = new RegExp(
  `^organizations/(${logicalIdentifierSource})/agentSessions/(${logicalIdentifierSource})/tasks/(${logicalIdentifierSource})$`,
);
const agentExecutionNamePattern = new RegExp(
  `^organizations/(${logicalIdentifierSource})/agentSessions/(${logicalIdentifierSource})/executions/(${logicalIdentifierSource})$`,
);
const agentExecutionAttemptNamePattern = new RegExp(
  `^organizations/(${logicalIdentifierSource})/agentSessions/(${logicalIdentifierSource})/executions/(${logicalIdentifierSource})/attempts/(${logicalIdentifierSource})$`,
);
const agentConversationEventNamePattern = new RegExp(
  `^organizations/(${logicalIdentifierSource})/agentSessions/(${logicalIdentifierSource})/events/(${positiveDecimalSequenceSource})$`,
);
const operationRunNamePattern = new RegExp(
  `^organizations/(${logicalIdentifierSource})/operations/(${logicalIdentifierSource})$`,
);
const operationCheckpointNamePattern = new RegExp(
  `^organizations/(${logicalIdentifierSource})/operations/(${logicalIdentifierSource})/checkpoints/(${positiveDecimalSequenceSource})$`,
);

type ResourceNameSchema = {
  parse(input: unknown): string;
};

const parseResourceName = (
  schema: ResourceNameSchema,
  pattern: RegExp,
  name: unknown,
): string[] => {
  const parsedName = schema.parse(name);
  const match = pattern.exec(parsedName);

  if (!match) {
    throw new Error("Invalid canonical resource name");
  }

  return match.slice(1);
};

const assertMatchingParent = (
  actual: readonly string[],
  expected: readonly string[],
  message: string,
) => {
  if (
    actual.length !== expected.length ||
    actual.some((component, index) => component !== expected[index])
  ) {
    throw new Error(message);
  }
};

export const formatOrganizationName = (
  organization: OrganizationId,
): OrganizationName =>
  OrganizationNameSchema.parse(`organizations/${organization}`);

export const parseOrganizationName = (name: unknown) => {
  const [organization] = parseResourceName(
    OrganizationNameSchema,
    organizationNamePattern,
    name,
  );

  return { organization: OrganizationIdSchema.parse(organization) };
};

export const formatUserName = (user: UserId): UserName =>
  UserNameSchema.parse(`users/${user}`);

export const parseUserName = (name: unknown) => {
  const [user] = parseResourceName(UserNameSchema, userNamePattern, name);

  return { user: UserIdSchema.parse(user) };
};

export const formatAgentDefinitionName = (
  agentDefinitionKey: AgentDefinitionKey,
): AgentDefinitionName =>
  AgentDefinitionNameSchema.parse(`agentDefinitions/${agentDefinitionKey}`);

export const parseAgentDefinitionName = (name: unknown) => {
  const [agentDefinitionKey] = parseResourceName(
    AgentDefinitionNameSchema,
    agentDefinitionNamePattern,
    name,
  );

  return {
    agentDefinitionKey: AgentDefinitionKeySchema.parse(agentDefinitionKey),
  };
};

export const formatAgentVersionName = (
  agentDefinitionKey: AgentDefinitionKey,
  version: AgentVersionKey,
): AgentVersionName =>
  AgentVersionNameSchema.parse(
    `agentDefinitions/${agentDefinitionKey}/versions/${version}`,
  );

export const parseAgentVersionName = (
  name: unknown,
  expectedParent?: unknown,
) => {
  const [agentDefinitionKey, version] = parseResourceName(
    AgentVersionNameSchema,
    agentVersionNamePattern,
    name,
  );

  if (expectedParent !== undefined) {
    const expected = parseAgentDefinitionName(expectedParent);
    assertMatchingParent(
      [agentDefinitionKey],
      [expected.agentDefinitionKey],
      "Agent version name does not match the expected agent definition",
    );
  }

  return {
    agentDefinitionKey: AgentDefinitionKeySchema.parse(agentDefinitionKey),
    version: AgentVersionKeySchema.parse(version),
  };
};

export const formatAgentSessionName = (
  organization: OrganizationId,
  session: AgentSessionId,
): AgentSessionName =>
  AgentSessionNameSchema.parse(
    `organizations/${organization}/agentSessions/${session}`,
  );

export const parseAgentSessionName = (
  name: unknown,
  expectedParent?: unknown,
) => {
  const [organization, session] = parseResourceName(
    AgentSessionNameSchema,
    agentSessionNamePattern,
    name,
  );

  if (expectedParent !== undefined) {
    const expected = parseOrganizationName(expectedParent);
    assertMatchingParent(
      [organization],
      [expected.organization],
      "Agent session name does not match the expected organization",
    );
  }

  return {
    organization: OrganizationIdSchema.parse(organization),
    session: AgentSessionIdSchema.parse(session),
  };
};

export const formatAgentSessionTaskName = (
  organization: OrganizationId,
  session: AgentSessionId,
  task: AgentSessionTaskId,
): AgentSessionTaskName =>
  AgentSessionTaskNameSchema.parse(
    `organizations/${organization}/agentSessions/${session}/tasks/${task}`,
  );

export const parseAgentSessionTaskName = (
  name: unknown,
  expectedParent?: unknown,
) => {
  const [organization, session, task] = parseResourceName(
    AgentSessionTaskNameSchema,
    agentSessionTaskNamePattern,
    name,
  );

  if (expectedParent !== undefined) {
    const expected = parseAgentSessionName(expectedParent);
    assertMatchingParent(
      [organization, session],
      [expected.organization, expected.session],
      "Agent session task name does not match the expected agent session",
    );
  }

  return {
    organization: OrganizationIdSchema.parse(organization),
    session: AgentSessionIdSchema.parse(session),
    task: AgentSessionTaskIdSchema.parse(task),
  };
};

export const formatAgentExecutionName = (
  organization: OrganizationId,
  session: AgentSessionId,
  execution: AgentExecutionId,
): AgentExecutionName =>
  AgentExecutionNameSchema.parse(
    `organizations/${organization}/agentSessions/${session}/executions/${execution}`,
  );

export const parseAgentExecutionName = (
  name: unknown,
  expectedParent?: unknown,
) => {
  const [organization, session, execution] = parseResourceName(
    AgentExecutionNameSchema,
    agentExecutionNamePattern,
    name,
  );

  if (expectedParent !== undefined) {
    const expected = parseAgentSessionName(expectedParent);
    assertMatchingParent(
      [organization, session],
      [expected.organization, expected.session],
      "Agent execution name does not match the expected agent session",
    );
  }

  return {
    organization: OrganizationIdSchema.parse(organization),
    session: AgentSessionIdSchema.parse(session),
    execution: AgentExecutionIdSchema.parse(execution),
  };
};

export const formatAgentExecutionAttemptName = (
  organization: OrganizationId,
  session: AgentSessionId,
  execution: AgentExecutionId,
  attempt: AgentExecutionAttemptId,
): AgentExecutionAttemptName =>
  AgentExecutionAttemptNameSchema.parse(
    `organizations/${organization}/agentSessions/${session}/executions/${execution}/attempts/${attempt}`,
  );

export const parseAgentExecutionAttemptName = (
  name: unknown,
  expectedParent?: unknown,
) => {
  const [organization, session, execution, attempt] = parseResourceName(
    AgentExecutionAttemptNameSchema,
    agentExecutionAttemptNamePattern,
    name,
  );

  if (expectedParent !== undefined) {
    const expected = parseAgentExecutionName(expectedParent);
    assertMatchingParent(
      [organization, session, execution],
      [expected.organization, expected.session, expected.execution],
      "Agent execution attempt name does not match the expected execution",
    );
  }

  return {
    organization: OrganizationIdSchema.parse(organization),
    session: AgentSessionIdSchema.parse(session),
    execution: AgentExecutionIdSchema.parse(execution),
    attempt: AgentExecutionAttemptIdSchema.parse(attempt),
  };
};

export const formatAgentConversationEventName = (
  organization: OrganizationId,
  session: AgentSessionId,
  sequence: PositiveDecimalSequence,
): AgentConversationEventName =>
  AgentConversationEventNameSchema.parse(
    `organizations/${organization}/agentSessions/${session}/events/${sequence}`,
  );

export const parseAgentConversationEventName = (
  name: unknown,
  expectedParent?: unknown,
) => {
  const [organization, session, sequence] = parseResourceName(
    AgentConversationEventNameSchema,
    agentConversationEventNamePattern,
    name,
  );

  if (expectedParent !== undefined) {
    const expected = parseAgentSessionName(expectedParent);
    assertMatchingParent(
      [organization, session],
      [expected.organization, expected.session],
      "Agent conversation event name does not match the expected agent session",
    );
  }

  return {
    organization: OrganizationIdSchema.parse(organization),
    session: AgentSessionIdSchema.parse(session),
    sequence: PositiveDecimalSequenceSchema.parse(sequence),
  };
};

export const formatOperationRunName = (
  organization: OrganizationId,
  operation: OperationRunId,
): OperationRunName =>
  OperationRunNameSchema.parse(
    `organizations/${organization}/operations/${operation}`,
  );

export const parseOperationRunName = (
  name: unknown,
  expectedParent?: unknown,
) => {
  const [organization, operation] = parseResourceName(
    OperationRunNameSchema,
    operationRunNamePattern,
    name,
  );

  if (expectedParent !== undefined) {
    const expected = parseOrganizationName(expectedParent);
    assertMatchingParent(
      [organization],
      [expected.organization],
      "Operation run name does not match the expected organization",
    );
  }

  return {
    organization: OrganizationIdSchema.parse(organization),
    operation: OperationRunIdSchema.parse(operation),
  };
};

export const formatOperationCheckpointName = (
  organization: OrganizationId,
  operation: OperationRunId,
  sequence: PositiveDecimalSequence,
): OperationCheckpointName =>
  OperationCheckpointNameSchema.parse(
    `organizations/${organization}/operations/${operation}/checkpoints/${sequence}`,
  );

export const parseOperationCheckpointName = (
  name: unknown,
  expectedParent?: unknown,
) => {
  const [organization, operation, sequence] = parseResourceName(
    OperationCheckpointNameSchema,
    operationCheckpointNamePattern,
    name,
  );

  if (expectedParent !== undefined) {
    const expected = parseOperationRunName(expectedParent);
    assertMatchingParent(
      [organization, operation],
      [expected.organization, expected.operation],
      "Operation checkpoint name does not match the expected operation run",
    );
  }

  return {
    organization: OrganizationIdSchema.parse(organization),
    operation: OperationRunIdSchema.parse(operation),
    sequence: PositiveDecimalSequenceSchema.parse(sequence),
  };
};

export type OwnerId = z.infer<typeof OwnerIdSchema>;
export type LogicalId = z.infer<typeof LogicalIdSchema>;
export type OrganizationId = z.infer<typeof OrganizationIdSchema>;
export type UserId = z.infer<typeof UserIdSchema>;
export type AgentSessionId = z.infer<typeof AgentSessionIdSchema>;
export type AgentSessionTaskId = z.infer<typeof AgentSessionTaskIdSchema>;
export type AgentExecutionId = z.infer<typeof AgentExecutionIdSchema>;
export type AgentExecutionAttemptId = z.infer<
  typeof AgentExecutionAttemptIdSchema
>;
export type AgentAttemptId = z.infer<typeof AgentAttemptIdSchema>;
export type AgentCapabilityInvocationId = z.infer<
  typeof AgentCapabilityInvocationIdSchema
>;
export type AgentCapabilityApprovalId = z.infer<
  typeof AgentCapabilityApprovalIdSchema
>;
export type OperationRunId = z.infer<typeof OperationRunIdSchema>;
export type AgentDefinitionKey = z.infer<typeof AgentDefinitionKeySchema>;
export type AgentVersionKey = z.infer<typeof AgentVersionKeySchema>;
export type CopilotThreadId = z.infer<typeof CopilotThreadIdSchema>;
export type AguiRunId = z.infer<typeof AguiRunIdSchema>;
export type ToolCallId = z.infer<typeof ToolCallIdSchema>;
export type RequestId = z.infer<typeof RequestIdSchema>;
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
export type PositiveDecimalSequence = z.infer<
  typeof PositiveDecimalSequenceSchema
>;
export type NonNegativeDecimalSequence = z.infer<
  typeof NonNegativeDecimalSequenceSchema
>;
export type OpaqueReplayCursor = z.infer<typeof OpaqueReplayCursorSchema>;
export type OpaqueShortLivedToken = z.infer<typeof OpaqueShortLivedTokenSchema>;
export type Sha256Digest = z.infer<typeof Sha256DigestSchema>;
export type OrganizationName = z.infer<typeof OrganizationNameSchema>;
export type UserName = z.infer<typeof UserNameSchema>;
export type AgentDefinitionName = z.infer<typeof AgentDefinitionNameSchema>;
export type AgentVersionName = z.infer<typeof AgentVersionNameSchema>;
export type AgentSessionName = z.infer<typeof AgentSessionNameSchema>;
export type AgentSessionTaskName = z.infer<typeof AgentSessionTaskNameSchema>;
export type AgentExecutionName = z.infer<typeof AgentExecutionNameSchema>;
export type AgentExecutionAttemptName = z.infer<
  typeof AgentExecutionAttemptNameSchema
>;
export type AgentConversationEventName = z.infer<
  typeof AgentConversationEventNameSchema
>;
export type OperationRunName = z.infer<typeof OperationRunNameSchema>;
export type OperationCheckpointName = z.infer<
  typeof OperationCheckpointNameSchema
>;
