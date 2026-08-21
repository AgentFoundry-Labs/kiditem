import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const outRoot = resolve(__dirname, "..");

const readPorts = [
  [
    "repository/interaction/agent-session-query.repository.port.ts",
    ["listSessions", "findAccessibleSession"],
  ],
  [
    "repository/interaction/agent-conversation-query.repository.port.ts",
    ["readConversationEvents", "readModelConversation"],
  ],
  [
    "repository/interaction/agent-execution-query.repository.port.ts",
    [
      "loadExecutionRuntimeContext",
      "findCurrentExecution",
      "findAccessibleCurrentExecution",
      "findCurrentSessionExecution",
    ],
  ],
  [
    "repository/session-control/agent-session-control-query.repository.port.ts",
    [
      "isExecutionCapabilityAllowed",
      "loadDelegationContext",
      "findTask",
      "findSession",
      "loadCancelableTask",
      "loadTaskExecution",
      "listLifecycleRecoveryCandidates",
    ],
  ],
] as const;

const transactionPorts = [
  [
    "transaction/interaction/agent-run-authorization.transaction.port.ts",
    ["authorizeExecution"],
  ],
  [
    "transaction/interaction/agent-conversation-event.transaction.port.ts",
    ["appendExecutionEvent", "markExecutionTerminal"],
  ],
  [
    "transaction/interaction/agent-execution-usage.transaction.port.ts",
    ["recordExecutionUsage"],
  ],
  [
    "transaction/session-control/agent-delegation.transaction.port.ts",
    ["createDelegatedTask"],
  ],
  [
    "transaction/session-control/agent-attempt-operation.transaction.port.ts",
    [
      "reserveAttemptForOperation",
      "findAttemptForOperation",
      "activateAttemptForOperation",
      "startAttempt",
      "persistAttemptHandle",
      "finishAttempt",
      "continueOperationAttempt",
    ],
  ],
  [
    "transaction/session-control/agent-approval-continuation.transaction.port.ts",
    [
      "requestApproval",
      "decideApproval",
      "loadApproval",
      "expireApproval",
      "advanceApprovedContinuation",
      "markApprovalContinuationInterruptDelivered",
      "listIncompleteApprovalContinuations",
    ],
  ],
  [
    "transaction/session-control/agent-session-transition.transaction.port.ts",
    [
      "appendArtifact",
      "transitionTask",
      "transitionSession",
      "createRetryExecution",
    ],
  ],
] as const;

const interactionAdapters = [
  "adapter/out/repository/interaction/prisma-agent-session-query.repository.ts",
  "adapter/out/repository/interaction/prisma-agent-conversation-query.repository.ts",
  "adapter/out/repository/interaction/prisma-agent-execution-query.repository.ts",
  "adapter/out/transaction/interaction/prisma-agent-run-authorization.transaction.ts",
  "adapter/out/transaction/interaction/prisma-agent-conversation-event.transaction.ts",
  "adapter/out/transaction/interaction/prisma-agent-execution-usage.transaction.ts",
] as const;

const retiredInteractionSymbols = [
  "AGENT_INTERACTION_REPOSITORY",
  "AgentInteractionRepositoryPort",
  "PrismaAgentInteractionRepository",
] as const;

const sessionControlAdapters = [
  "adapter/out/repository/session-control/prisma-agent-session-control-query.repository.ts",
  "adapter/out/transaction/session-control/prisma-agent-delegation.transaction.ts",
  "adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction.ts",
  "adapter/out/transaction/session-control/prisma-agent-approval-continuation.transaction.ts",
  "adapter/out/transaction/session-control/prisma-agent-session-transition.transaction.ts",
] as const;

const retiredSessionControlSymbols = [
  "AGENT_SESSION_CONTROL_REPOSITORY",
  "AgentSessionControlRepositoryPort",
  "PrismaAgentSessionControlRepository",
] as const;

const sessionControlAdapterSeams = [
  [
    "adapter/out/repository/session-control/prisma-agent-session-control-query.repository.ts",
    "AgentSessionControlQueryRepositoryPort",
    [
      "isExecutionCapabilityAllowed",
      "loadDelegationContext",
      "loadCancelableTask",
      "loadTaskExecution",
      "listLifecycleRecoveryCandidates",
    ],
  ],
  [
    "adapter/out/transaction/session-control/prisma-agent-delegation.transaction.ts",
    "AgentDelegationTransactionPort",
    ["createDelegatedTask"],
  ],
  [
    "adapter/out/transaction/session-control/prisma-agent-attempt-operation.transaction.ts",
    "AgentAttemptOperationTransactionPort",
    [
      "reserveAttemptForOperation",
      "findAttemptForOperation",
      "activateAttemptForOperation",
      "startAttempt",
      "persistAttemptHandle",
      "finishAttempt",
      "continueOperationAttempt",
    ],
  ],
  [
    "adapter/out/transaction/session-control/prisma-agent-approval-continuation.transaction.ts",
    "AgentApprovalContinuationTransactionPort",
    [
      "requestApproval",
      "decideApproval",
      "loadApproval",
      "expireApproval",
      "advanceApprovedContinuation",
      "markApprovalContinuationInterruptDelivered",
      "listIncompleteApprovalContinuations",
    ],
  ],
  [
    "adapter/out/transaction/session-control/prisma-agent-session-transition.transaction.ts",
    "AgentSessionTransitionTransactionPort",
    [
      "appendArtifact",
      "transitionTask",
      "transitionSession",
      "createRetryExecution",
    ],
  ],
] as const;

describe("AgentOS persistence seam contracts", () => {
  it.each(readPorts)(
    "defines %s as a read-only narrow port",
    (path, methods) => {
      const file = resolve(outRoot, path);
      expect(existsSync(file)).toBe(true);
      const source = readFileSync(file, "utf8");
      for (const method of methods) expect(source).toContain(`${method}(`);
      expect(source).not.toMatch(
        /\b(?:append|authorize|create|reserve|activate|start|persist|finish|request|decide|expire|advance|mark|transition|record)\w*\s*\(/,
      );
    },
  );

  it.each(transactionPorts)(
    "defines %s as one lifecycle command seam",
    (path, methods) => {
      const file = resolve(outRoot, path);
      expect(existsSync(file)).toBe(true);
      const source = readFileSync(file, "utf8");
      for (const method of methods) expect(source).toContain(`${method}(`);
    },
  );

  it.each(interactionAdapters)(
    "%s owns PrismaService directly without an aggregate persistence dependency",
    (path) => {
      const source = readFileSync(
        resolve(outRoot, "..", "..", "..", path),
        "utf8",
      );
      expect(source).toContain("PrismaService");
      expect(source).toMatch(
        /constructor\(private readonly prisma: PrismaService\)/,
      );
      expect(source).not.toMatch(
        /PrismaAgentInteractionPersistence|from\s+["'][^"']*internal\/prisma-agent-interaction\.persistence["']/,
      );
    },
  );

  it("removes the retired interaction aggregate port and adapter", () => {
    const agentOsRoot = resolve(outRoot, "..", "..", "..");
    const sources = [
      resolve(outRoot, "repository/agent-interaction-repository.port.ts"),
      resolve(
        agentOsRoot,
        "adapter/out/repository/prisma-agent-interaction.repository.ts",
      ),
      resolve(
        agentOsRoot,
        "adapter/out/internal/prisma-agent-interaction.persistence.ts",
      ),
    ];
    for (const path of sources) expect(existsSync(path)).toBe(false);
    for (const symbol of retiredInteractionSymbols) {
      for (const path of interactionAdapters) {
        expect(readFileSync(resolve(agentOsRoot, path), "utf8")).not.toContain(
          symbol,
        );
      }
    }
  });

  it.each(sessionControlAdapters)(
    "%s owns PrismaService directly without an aggregate persistence dependency",
    (path) => {
      const source = readFileSync(
        resolve(outRoot, "..", "..", "..", path),
        "utf8",
      );
      expect(source).toContain("PrismaService");
      expect(source).toMatch(
        /constructor\(private readonly prisma: PrismaService\)/,
      );
      expect(source).not.toMatch(
        /SessionControlPersistenceStore|from\s+["'][^"']*adapter\/out\/internal\//,
      );
      expect(source).toMatch(/this\.prisma\./);
    },
  );

  it("removes the retired session-control aggregate port and adapter", () => {
    const agentOsRoot = resolve(outRoot, "..", "..", "..");
    const sources = [
      resolve(outRoot, "repository/agent-session-control.repository.port.ts"),
      resolve(
        agentOsRoot,
        "adapter/out/repository/prisma-agent-session-control.repository.ts",
      ),
      resolve(
        agentOsRoot,
        "adapter/out/internal/prisma-agent-session-control.persistence.ts",
      ),
    ];
    for (const path of sources) expect(existsSync(path)).toBe(false);
    for (const symbol of retiredSessionControlSymbols) {
      for (const path of sessionControlAdapters) {
        expect(readFileSync(resolve(agentOsRoot, path), "utf8")).not.toContain(
          symbol,
        );
      }
    }
  });

  it.each(sessionControlAdapterSeams)(
    "%s imports and exposes only its owned narrow persistence seam",
    (path, ownedPort, ownedMethods) => {
      const source = readFileSync(
        resolve(outRoot, "..", "..", "..", path),
        "utf8",
      );
      expect(source).toContain(`implements ${ownedPort}`);
      expect(source).not.toContain("SessionControlPersistenceMethods");

      for (const port of sessionControlAdapterSeams.map(([, port]) => port)) {
        if (port === ownedPort) {
          expect(source).toContain(`type { ${port} }`);
        } else {
          expect(source).not.toContain(port);
        }
      }

      const foreignMethods = sessionControlAdapterSeams
        .filter(([, port]) => port !== ownedPort)
        .flatMap(([, , methods]) => methods);
      for (const method of foreignMethods) {
        expect(source).not.toMatch(new RegExp(`\\basync\\s+${method}\\s*\\(`));
      }
      for (const method of ownedMethods) {
        expect(source).toMatch(new RegExp(`\\basync\\s+${method}\\s*\\(`));
      }
    },
  );
});
