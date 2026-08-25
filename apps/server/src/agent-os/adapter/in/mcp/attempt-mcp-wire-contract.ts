import { z as z4 } from 'zod-v4';

export const ATTEMPT_MCP_TOOL_NAMES = [
  'capability_catalog_search',
  'capability_invoke',
  'invocation_status',
  'invocation_wait',
  'invocation_result',
  'delegate_to_agent',
  'child_status',
  'child_wait',
  'child_result',
  'child_message',
  'child_interrupt',
] as const;

export type AttemptMcpToolName = (typeof ATTEMPT_MCP_TOOL_NAMES)[number];

const InputRecordSchema = z4.record(z4.string(), z4.unknown());
const InvocationInputSchema = z4.object({
  invocationId: z4.string().uuid(),
}).strict();
const ChildInputSchema = z4.object({
  childTaskId: z4.string().uuid(),
  message: z4.string().min(1).max(4_000).optional(),
}).strict();
const ChildMessageCommandKeySchema = z4.string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  .describe('Opaque logical message key. Generate a new value for a new message and reuse it only for an exact retry.');

export const AttemptMcpWireInputSchemas = {
  capability_catalog_search: z4.object({
    query: z4.string().max(256).default(''),
  }).strict(),
  capability_invoke: z4.object({
    capabilityKey: z4.string().min(1).max(160),
    input: InputRecordSchema,
  }).strict(),
  invocation_status: InvocationInputSchema,
  invocation_wait: InvocationInputSchema,
  invocation_result: InvocationInputSchema,
  delegate_to_agent: z4.object({
    targetAgentKey: z4.string().min(1).max(64),
    objective: z4.string().min(1).max(8_000),
    capabilityKey: z4.string().min(1).max(160).optional(),
    input: InputRecordSchema.optional(),
  }).strict().superRefine((value, context) => {
    if ((value.capabilityKey === undefined) !== (value.input === undefined)) {
      context.addIssue({
        code: z4.ZodIssueCode.custom,
        message: 'capabilityKey and input must be supplied together',
      });
    }
  }),
  child_status: ChildInputSchema,
  child_wait: ChildInputSchema,
  child_result: ChildInputSchema,
  child_message: ChildInputSchema.extend({
    message: z4.string().min(1).max(4_000),
    messageCommandKey: ChildMessageCommandKeySchema,
  }).strict(),
  child_interrupt: ChildInputSchema,
} as const;

export type AttemptMcpWireInput = {
  [Name in AttemptMcpToolName]: z4.output<(typeof AttemptMcpWireInputSchemas)[Name]>;
};
