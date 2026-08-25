import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const agentOsRoot = resolve(__dirname, "..");
const workPortRoot = resolve(
  agentOsRoot,
  "application/port/out/work",
);

const persistencePorts = [
  {
    file: "agent-work-admission.port.ts",
    interfaceName: "AgentWorkAdmissionPort",
    token: "AGENT_WORK_ADMISSION_PORT",
    methods: [
      "admitRootAttempt",
      "admitAttempt",
      "findDelegationReplay",
      "delegateTask",
    ],
  },
  {
    file: "agent-work-invocation-approval.port.ts",
    interfaceName: "AgentWorkInvocationApprovalPort",
    token: "AGENT_WORK_INVOCATION_APPROVAL_PORT",
    methods: [
      "authorizeInvocation",
      "decideApproval",
      "expireApproval",
      "finalizeInlineInvocation",
    ],
  },
  {
    file: "agent-work-mutation.port.ts",
    interfaceName: "AgentWorkMutationPort",
    token: "AGENT_WORK_MUTATION_PORT",
    methods: ["claimMutation", "finalizeMutation"],
  },
  {
    file: "agent-work-lifecycle.port.ts",
    interfaceName: "AgentWorkLifecyclePort",
    token: "AGENT_WORK_LIFECYCLE_PORT",
    methods: [
      "reconcile",
      "transitionTask",
      "transitionAttempt",
      "finalizeTaskFromAttempt",
      "deleteTerminalSession",
    ],
  },
] as const;

const applicationCallers = [
  ["application/service/work/agent-attempt-admission.service.ts", "AgentWorkAdmissionPort"],
  ["application/service/work/agent-capability-invocation.service.ts", "AgentWorkInvocationApprovalPort"],
  ["application/service/work/agent-capability-approval.service.ts", "AgentWorkInvocationApprovalPort"],
  ["application/service/work/agent-approval-expiry.service.ts", "AgentWorkInvocationApprovalPort"],
  ["application/service/work/agent-mutation-dispatcher.service.ts", "AgentWorkMutationPort"],
  ["application/service/work/agent-task-lifecycle.service.ts", "AgentWorkLifecyclePort"],
  ["application/service/work/agent-attempt-reconciler.service.ts", "AgentWorkLifecyclePort"],
  ["application/service/work/agent-attempt-launch.service.ts", "AgentWorkLifecyclePort"],
  ["application/service/work/agent-session-terminal-delete.service.ts", "AgentWorkLifecyclePort"],
] as const;

function source(file: string): string {
  const path = resolve(agentOsRoot, file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("Agent Work persistence Interfaces", () => {
  it("deletes the broad transaction caller surface in favor of four invariant clusters", () => {
    expect(
      existsSync(resolve(workPortRoot, "agent-work-transaction.port.ts")),
    ).toBe(false);

    for (const port of persistencePorts) {
      const portSource = source(`application/port/out/work/${port.file}`);
      expect(portSource, `missing ${port.file}`).toContain(
        `export const ${port.token}`,
      );
      expect(portSource).toContain(`export interface ${port.interfaceName}`);
      for (const method of port.methods) {
        expect(portSource).toMatch(new RegExp(`\\b${method}\\s*\\(`));
      }
    }
  });

  it("lets each application Module depend on its cohesive Interface rather than reconstructing a Pick", () => {
    for (const [file, interfaceName] of applicationCallers) {
      const callerSource = source(file);
      expect(callerSource).toContain(interfaceName);
      expect(callerSource).not.toContain("AgentWorkTransactionPort");
      expect(callerSource).not.toMatch(
        /Pick<\s*AgentWork(?:Transaction|Admission|InvocationApproval|Mutation|Lifecycle)Port/,
      );
    }
  });

  it("keeps all four Interfaces on one guarded Prisma atomicity kernel", () => {
    const adapter = source(
      "adapter/out/transaction/work/prisma-agent-work.transaction.ts",
    );
    const providers = source(
      "adapter/out/transaction/work/agent-work-persistence.providers.ts",
    );

    expect(adapter).toContain("internal/agent-work-transaction.guards");
    for (const port of persistencePorts) {
      expect(adapter).toContain(port.interfaceName);
      expect(providers).toContain(port.token);
    }
    expect(providers.match(/useExisting:\s*PrismaAgentWorkTransaction/g)).toHaveLength(
      persistencePorts.length,
    );
  });
});
