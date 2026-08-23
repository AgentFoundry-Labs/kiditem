import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("final Agent OS persistence graph", () => {
  const modelsDirectory = resolve(process.cwd(), "../../prisma/models");
  const modelSources = readdirSync(modelsDirectory)
    .filter((file) => file.endsWith(".prisma"))
    .map((file) => readFileSync(resolve(modelsDirectory, file), "utf8"));
  const schema = modelSources.join("\n");

  it("uses final logical names while retaining the agent_work physical tables", () => {
    expect([...schema.matchAll(/^model\s+(Agent\w+)/gm)].map((match) => match[1]))
      .toEqual([
        "AgentVersion",
        "AgentSession",
        "AgentTask",
        "AgentAttempt",
        "AgentCapabilityInvocation",
        "AgentCapabilityApproval",
      ]);
    expect(schema).not.toMatch(/\bAgentWork(?:Version|Session|Task)\b/);
    expect(schema).toContain('@@map("agent_work_versions")');
    expect(schema).toContain('@@map("agent_work_sessions")');
    expect(schema).toContain('@@map("agent_work_tasks")');
  });
});
