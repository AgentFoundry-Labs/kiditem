import { dirname, join } from 'node:path';

const runtime = require(join(dirname(require.resolve('@copilotkit/runtime')), 'v2', 'index.cjs')) as {
  AgentRunner: new () => object;
  CopilotSseRuntime: new (input: object) => object;
  createCopilotRuntimeHandler: (input: object) => (request: Request) => Promise<Response>;
};
export const CopilotAgentRunner = runtime.AgentRunner;
export const CopilotSseRuntime = runtime.CopilotSseRuntime;
export const createCopilotRuntimeHandler = runtime.createCopilotRuntimeHandler;
