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
export const OperationRunIdSchema =
  logicalIdentifierSchema.brand<"OperationRunId">();

export const AgentDefinitionKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(agentDefinitionKeyPattern)
  .brand<"AgentDefinitionKey">();

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
export type OperationRunId = z.infer<typeof OperationRunIdSchema>;
export type AgentDefinitionKey = z.infer<typeof AgentDefinitionKeySchema>;
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
export type OperationRunName = z.infer<typeof OperationRunNameSchema>;
export type OperationCheckpointName = z.infer<
  typeof OperationCheckpointNameSchema
>;
