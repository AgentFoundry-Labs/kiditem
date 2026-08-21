import type { Provider } from "@nestjs/common";

export const INTERACTION_CLOCK = Symbol("INTERACTION_CLOCK");
export const INTERACTION_GATEWAY_SHARED_SECRET = Symbol(
  "INTERACTION_GATEWAY_SHARED_SECRET",
);
export const INTERACTION_PRINCIPAL_HMAC_KEY = Symbol(
  "INTERACTION_PRINCIPAL_HMAC_KEY",
);
export const INTERACTION_RUN_INTENT_HMAC_KEY = Symbol(
  "INTERACTION_RUN_INTENT_HMAC_KEY",
);
export const INTERACTION_REPLAY_CURSOR_HMAC_KEY = Symbol(
  "INTERACTION_REPLAY_CURSOR_HMAC_KEY",
);
export type InteractionClock = () => Date;

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
