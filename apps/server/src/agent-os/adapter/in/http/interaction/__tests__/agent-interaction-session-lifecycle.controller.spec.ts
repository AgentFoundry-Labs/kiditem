import { describe, expect, it, vi } from "vitest";
import { AgentInteractionSessionLifecycleController } from "../agent-interaction-session-lifecycle.controller";
import type { AuthUser } from "../../../../../../auth/auth.types";

const organizationId = "organization-1";
const user: AuthUser = {
  id: "user-1",
  organizationId,
  membershipId: "membership-1",
  role: "owner",
  type: "human",
  email: "operator@test.local",
};

describe("AgentInteractionSessionLifecycleController", () => {
  it("derives actor and organization from auth decorators before delegating to the lifecycle port", async () => {
    const lifecycle = { execute: vi.fn().mockResolvedValue({ status: "archived" }) };
    const controller = new AgentInteractionSessionLifecycleController(lifecycle as never);
    const body = {
      session: "organizations/organization-1/agentSessions/session-1",
      command: "archive" as const,
      reason: "Retain completed conversation",
      idempotencyKey: "archive-session-key-01",
    };

    await expect(controller.execute(user, organizationId, body)).resolves.toEqual({
      status: "archived",
    });
    expect(lifecycle.execute).toHaveBeenCalledWith({
      organizationId,
      actorId: user.id,
      session: body.session,
      command: body.command,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
    });
  });
});
