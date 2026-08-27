import { randomBytes, randomUUID } from 'node:crypto';
import { GATEWAY_RUNTIME_TRAIN, gatewayPlatformFromNodePlatform } from '@kiditem/shared/agent-runtime';
import { loadGatewayConfig, readGatewayInstallationToken } from './config/gateway-config';
import { GatewayControlClient } from './control/gateway-control.client';
import { GatewayCommandDispatcher } from './control/gateway-command-dispatcher';
import { GatewayEventOutbox } from './control/gateway-event-outbox';
import { NativeGatewayControlSession } from './control/native-gateway-control-session';
import { ConversationDescriptorStore } from './conversation/conversation-descriptor.store';
import { ConversationGateway } from './conversation/conversation-gateway';
import { ConversationPreferenceStore } from './conversation/conversation-preference.store';
import { startNativeProviderRuntime } from './provider/native-provider-runtime';

export async function runNativeAgentGateway(argv: readonly string[]): Promise<never> {
  const config = await loadGatewayConfig(argv);
  const token = await readGatewayInstallationToken(config.tokenFile);
  const mcpTransportToken = randomBytes(32).toString('base64url');
  const platform = gatewayPlatformFromNodePlatform();
  let providerFatal = false;
  let failGateway: (() => void) | null = null;
  const onProviderFatal = (): void => {
    if (providerFatal) return;
    providerFatal = true;
    failGateway?.();
  };
  const runtime = await startNativeProviderRuntime({
    runtimeRoot: config.runtimeRoot,
    workspace: config.workspace,
    loginRoot: config.loginRoot,
    stateRoot: config.stateRoot,
    platform,
    controlOrigin: config.controlOrigin,
    mcpTransportToken,
    onFatal: onProviderFatal,
  });
  const preferences = new ConversationPreferenceStore({ stateRoot: config.stateRoot, platform });
  const gateway = new ConversationGateway({
    descriptors: new ConversationDescriptorStore({ stateRoot: config.stateRoot, platform }),
    providers: runtime.providers,
  });
  const gatewayInstanceId = randomUUID();
  const outbox = new GatewayEventOutbox({ gatewayInstanceId, redactionTokens: [token, mcpTransportToken] });
  const readiness = await runtime.readiness();
  const dispatcher = new GatewayCommandDispatcher({ gateway, outbox, preferences });
  const client = new GatewayControlClient({ controlOrigin: config.controlOrigin, token });
  const control = new NativeGatewayControlSession({
    client,
    dispatcher,
    outbox,
    poll: { kind: 'poll', gatewayInstanceId, platform, runtimeTrain: GATEWAY_RUNTIME_TRAIN, mcpTransportToken },
    onApiRuntimeRegistered: () => { outbox.enqueue({ kind: 'gateway.readiness', readiness }); },
    onPollLoss: runtime.close,
  });
  const shutdown = (): void => { void control.shutdown().catch(() => undefined); };
  failGateway = shutdown;
  if (providerFatal) shutdown();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  try {
    return await control.run();
  } finally {
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
    await control.shutdown();
  }
}

if (process.argv[1]?.endsWith('main.cjs')) {
  void runNativeAgentGateway(process.argv.slice(2)).catch(() => { process.exitCode = 1; });
}
