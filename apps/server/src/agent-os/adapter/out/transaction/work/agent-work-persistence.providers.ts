import type { Provider } from "@nestjs/common";
import { AGENT_WORK_ADMISSION_PORT } from "../../../../application/port/out/work/agent-work-admission.port";
import { AGENT_WORK_INVOCATION_APPROVAL_PORT } from "../../../../application/port/out/work/agent-work-invocation-approval.port";
import { AGENT_WORK_LIFECYCLE_PORT } from "../../../../application/port/out/work/agent-work-lifecycle.port";
import { AGENT_WORK_MUTATION_PORT } from "../../../../application/port/out/work/agent-work-mutation.port";
import { PrismaAgentWorkTransaction } from "./prisma-agent-work.transaction";

/**
 * Nest composition binds every cohesive persistence Interface to the same
 * Prisma atomicity kernel. Do not replace these with independently-created
 * adapters: the guards and row-lock ordering are shared invariants.
 */
export const AGENT_WORK_PERSISTENCE_PORT_PROVIDERS = [
  {
    provide: AGENT_WORK_ADMISSION_PORT,
    useExisting: PrismaAgentWorkTransaction,
  },
  {
    provide: AGENT_WORK_INVOCATION_APPROVAL_PORT,
    useExisting: PrismaAgentWorkTransaction,
  },
  {
    provide: AGENT_WORK_MUTATION_PORT,
    useExisting: PrismaAgentWorkTransaction,
  },
  {
    provide: AGENT_WORK_LIFECYCLE_PORT,
    useExisting: PrismaAgentWorkTransaction,
  },
] satisfies Provider[];
