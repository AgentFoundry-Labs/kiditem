import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  CopilotRuntime,
  copilotRuntimeNestEndpoint,
} from '@copilotkit/runtime';
import type { IncomingMessage, ServerResponse } from 'http';
import { ClaudeCliAdapter } from './claude-cli-adapter';

@Injectable()
export class CopilotKitService implements OnModuleInit {
  private handler!: (req: IncomingMessage, res: ServerResponse) => Promise<void>;

  onModuleInit() {
    const serviceAdapter = new ClaudeCliAdapter();
    const runtime = new CopilotRuntime();

    this.handler = copilotRuntimeNestEndpoint({
      runtime,
      serviceAdapter,
      endpoint: '/api/copilotkit',
    }) as (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    return this.handler(req, res);
  }
}
