// The pinned CopilotKit v2 package exposes this public runtime from an ESM-only
// export. Nest compiles CommonJS, so load its published CJS artifact directly.
// This is the same OSS runtime handler; no Node listener or internal fetch is used.
import { dirname, join } from "node:path";

const runtime = require(join(dirname(require.resolve("@copilotkit/runtime")), "v2", "index.cjs")) as {
  AgentRunner: new () => object;
  CopilotSseRuntime: new (input: object) => object;
  createCopilotRuntimeHandler: (input: object) => (request: Request) => Promise<Response>;
};
export const CopilotAgentRunner = runtime.AgentRunner;
export const CopilotSseRuntime = runtime.CopilotSseRuntime;
export const createCopilotRuntimeHandler = runtime.createCopilotRuntimeHandler;
