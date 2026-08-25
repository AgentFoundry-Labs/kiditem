import { z } from 'zod';

export const GATEWAY_RUNTIME_TRAIN = Object.freeze({
  controlRevision: 'kiditem-gateway-control-v1',
  mcpProtocolRevision: '2026-07-28',
  codexVersion: '0.149.1',
  claudeVersion: '2.1.245',
  nodeMajor: 22,
} as const);

export const GatewayRuntimeTrainSchema = z.object({
  controlRevision: z.literal(GATEWAY_RUNTIME_TRAIN.controlRevision),
  mcpProtocolRevision: z.literal(GATEWAY_RUNTIME_TRAIN.mcpProtocolRevision),
  codexVersion: z.literal(GATEWAY_RUNTIME_TRAIN.codexVersion),
  claudeVersion: z.literal(GATEWAY_RUNTIME_TRAIN.claudeVersion),
  nodeMajor: z.literal(GATEWAY_RUNTIME_TRAIN.nodeMajor),
}).strict();
export type GatewayRuntimeTrain = z.infer<typeof GatewayRuntimeTrainSchema>;

export const GatewayPlatformSchema = z.enum(['macos', 'windows']);
export type GatewayPlatform = z.infer<typeof GatewayPlatformSchema>;

export const ProviderRuntimeSchema = z.enum(['codex_cli', 'claude_cli']);
export type ProviderRuntime = z.infer<typeof ProviderRuntimeSchema>;

export function providerRuntimeVersion(runtime: ProviderRuntime): string {
  return runtime === 'codex_cli'
    ? GATEWAY_RUNTIME_TRAIN.codexVersion
    : GATEWAY_RUNTIME_TRAIN.claudeVersion;
}

export function gatewayPlatformFromNodePlatform(platform: string = process.platform): GatewayPlatform {
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  throw new Error('gateway_platform_unsupported');
}
