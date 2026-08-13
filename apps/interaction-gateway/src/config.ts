import { z } from 'zod';

const excludedProductKey =
  /^COPILOTKIT_(?:ENTERPRISE|INTELLIGENCE|PREMIUM|LICENSE)(?:_|$)/;

const GatewayEnvironmentSchema = z
  .object({
    INTERACTION_GATEWAY_PORT: z.coerce.number().int().min(1).max(65_535),
    KIDITEM_API_INTERNAL_URL: z.string().url(),
    AGENT_OS_AGUI_INTERNAL_URL: z.string().url(),
    INTERACTION_GATEWAY_SHARED_SECRET: z.string().min(32),
    COPILOTKIT_TELEMETRY_DISABLED: z.literal('1'),
  })
  .passthrough()
  .superRefine((environment, context) => {
    const excludedKey = Object.keys(environment).find((key) =>
      excludedProductKey.test(key),
    );
    if (excludedKey) {
      context.addIssue({
        code: 'custom',
        path: [excludedKey],
        message: 'Enterprise/Premium configuration is not supported',
      });
    }
  });

export interface GatewayConfig {
  readonly port: number;
  readonly kidItemApiInternalUrl: string;
  readonly agentOsAguiInternalUrl: string;
  readonly interactionGatewaySharedSecret: string;
  readonly telemetryDisabled: true;
}

export function parseGatewayConfig(
  environment: Record<string, string | undefined>,
): GatewayConfig {
  const parsed = GatewayEnvironmentSchema.parse(environment);
  return Object.freeze({
    port: parsed.INTERACTION_GATEWAY_PORT,
    kidItemApiInternalUrl: parsed.KIDITEM_API_INTERNAL_URL,
    agentOsAguiInternalUrl: parsed.AGENT_OS_AGUI_INTERNAL_URL,
    interactionGatewaySharedSecret: parsed.INTERACTION_GATEWAY_SHARED_SECRET,
    telemetryDisabled: true,
  });
}
