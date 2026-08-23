import { z } from "zod";
import { UserMessageEventPayloadSchema } from "@kiditem/shared/agent-interaction";

/**
 * Public interaction input contract shared by authenticated transports and
 * the authorization use case. It deliberately belongs to the input boundary:
 * transports validate the same durable shape before handing it to the port.
 */
export const UserEventSchema = z
  .object({
    externalEventId: z.string().min(1).max(128),
    schemaVersion: z.literal(1),
    payload: UserMessageEventPayloadSchema,
  })
  .strict();
