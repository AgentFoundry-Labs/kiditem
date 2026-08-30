import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const prismaModels = resolve(process.cwd(), "../../prisma/models");
const agentWorkSchema = readFileSync(
  resolve(prismaModels, "agent-work.prisma"),
  "utf8",
);
const coreSchema = readFileSync(resolve(prismaModels, "core.prisma"), "utf8");

describe("final Agent OS persistence graph", () => {
  it("has only CapabilityInvocation in the Agent OS model file", () => {
    expect(
      [...agentWorkSchema.matchAll(/^model\s+(\w+)/gm)].map((match) => match[1]),
    ).toEqual(["CapabilityInvocation"]);
    expect(agentWorkSchema).not.toMatch(
      /\bAgent(?:Version|Session|Task|Attempt|CapabilityInvocation|CapabilityApproval)\b/,
    );
  });

  it("uses the current Organization and User reverse relation names", () => {
    expect(coreSchema).toMatch(/capabilityInvocations\s+CapabilityInvocation\[\]/);
    expect(coreSchema).toMatch(
      /initiatedCapabilityInvocations\s+CapabilityInvocation\[\]\s+@relation\("CapabilityInvocationInitiator"\)/,
    );
    expect(coreSchema).toMatch(
      /approvedCapabilityInvocations\s+CapabilityInvocation\[\]\s+@relation\("CapabilityInvocationApprover"\)/,
    );
    expect(coreSchema).not.toMatch(
      /AgentVersion|AgentSession|AgentTask|AgentAttempt|AgentCapabilityInvocation|AgentCapabilityApproval/,
    );
  });
});
