import { HmacAgentSessionTombstoneHasher } from "../../../out/crypto/hmac-agent-session-tombstone-hasher.adapter";
import { AGENT_SESSION_TOMBSTONE_HASHER } from "../../../../application/port/out/crypto/agent-session-tombstone-hasher.port";
import { readRequiredInteractionSecret } from "./interaction-gateway.config";
import type { Provider } from "@nestjs/common";

export const interactionLifecycleEnvironmentProviders: Provider[] = [
  {
    provide: HmacAgentSessionTombstoneHasher,
    useFactory: () =>
      new HmacAgentSessionTombstoneHasher(
        readRequiredInteractionSecret("INTERACTION_LIFECYCLE_HMAC_KEY"),
        "v1",
      ),
  },
  {
    provide: AGENT_SESSION_TOMBSTONE_HASHER,
    useExisting: HmacAgentSessionTombstoneHasher,
  },
];
