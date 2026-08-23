import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);
const schema = readFileSync(
  path.join(root, "prisma/models/agent-work.prisma"),
  "utf8",
);

describe("Agent work replacement schema", () => {
  it("uses actual string status fields and replacement physical mappings", () => {
    for (const model of [
      "AgentTask",
      "AgentAttempt",
      "AgentCapabilityInvocation",
      "AgentCapabilityApproval",
    ]) {
      expect(schema).toMatch(
        new RegExp(`model ${model}[\\s\\S]*?status String`),
      );
    }
    for (const table of [
      "agent_work_versions",
      "agent_work_sessions",
      "agent_work_tasks",
      "agent_attempts",
      "agent_capability_invocations",
      "agent_capability_approvals",
    ])
      expect(schema).toContain(`@@map(\"${table}\")`);
  });

  it("defines partial work invariants and excludes forbidden fields", () => {
    expect(schema).toContain('where: raw("parent_task_id IS NULL")');
    expect(schema).toContain(
      "where: raw(\"status IN ('starting', 'running')\")",
    );
    expect(schema).toContain("delegation_idempotency_key IS NOT NULL");
    expect(schema).toContain("idempotency_requirement = 'required'");
    expect(schema).toMatch(
      /authorizationExpiresAt DateTime @map\("authorization_expires_at"\)/,
    );
    expect(schema).not.toMatch(
      /continuationMode|continuationKey|lifecycle\s+String|enum\s+/,
    );
  });
});
