import type { Provider } from "@nestjs/common";
import {
  INTERACTION_CLOCK,
  INTERACTION_GATEWAY_SHARED_SECRET,
  INTERACTION_PRINCIPAL_HMAC_KEY,
  INTERACTION_REPLAY_CURSOR_HMAC_KEY,
  INTERACTION_RUN_INTENT_HMAC_KEY,
} from "../../../../application/port/in/interaction/interaction-gateway-config.port";

export function readRequiredInteractionSecret(
  name: string,
  value: string | undefined = process.env[name],
): Buffer {
  if (!value) throw new Error(`${name} is required`);
  const secret = Buffer.from(value, "utf8");
  if (secret.byteLength < 32)
    throw new Error(`${name} must be at least 32 bytes`);
  return secret;
}

export const interactionEnvironmentProviders: Provider[] = [
  { provide: INTERACTION_CLOCK, useValue: (): Date => new Date() },
  ...[
    [INTERACTION_GATEWAY_SHARED_SECRET, "INTERACTION_GATEWAY_SHARED_SECRET"],
    [INTERACTION_PRINCIPAL_HMAC_KEY, "INTERACTION_PRINCIPAL_HMAC_KEY"],
    [INTERACTION_RUN_INTENT_HMAC_KEY, "INTERACTION_RUN_INTENT_HMAC_KEY"],
    [INTERACTION_REPLAY_CURSOR_HMAC_KEY, "INTERACTION_REPLAY_CURSOR_HMAC_KEY"],
  ].map(([provide, name]) => ({
    provide,
    useFactory: (): Buffer => readRequiredInteractionSecret(String(name)),
  })),
];
