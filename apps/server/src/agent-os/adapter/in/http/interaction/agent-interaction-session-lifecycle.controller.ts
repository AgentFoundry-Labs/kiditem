import { Body, Controller, Inject, Post } from "@nestjs/common";
import { AgentSessionLifecycleCommandSchema } from "@kiditem/shared/agent-interaction";
import { CurrentOrganization } from "../../../../../auth/decorators/current-organization.decorator";
import { CurrentUser } from "../../../../../auth/decorators/current-user.decorator";
import { Roles } from "../../../../../auth/decorators/roles.decorator";
import {
  AGENT_INTERACTION_SESSION_LIFECYCLE_PORT,
  type AgentInteractionSessionLifecyclePort,
} from "../../../../application/port/in/interaction/agent-interaction-session-lifecycle.port";
import { interactionHttpCall } from "./interaction-http-error";
import type { AuthUser } from "../../../../../auth/auth.types";

@Controller("agent-os/interaction/sessions")
export class AgentInteractionSessionLifecycleController {
  constructor(
    @Inject(AGENT_INTERACTION_SESSION_LIFECYCLE_PORT)
    private readonly lifecycle: AgentInteractionSessionLifecyclePort,
  ) {}

  @Post("lifecycle")
  @Roles("owner", "admin")
  async execute(
    @CurrentUser() user: AuthUser,
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    return interactionHttpCall(() =>
      this.lifecycle.execute({
        organizationId,
        actorId: user.id,
        ...AgentSessionLifecycleCommandSchema.parse(body),
      }),
    );
  }
}
