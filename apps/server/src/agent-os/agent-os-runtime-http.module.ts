import { Module } from '@nestjs/common';
import { AgentRuntimeApplicationModule } from '../agent-runtime-application.module';
import {
  AttemptMcpHttpController,
  ATTEMPT_MCP_HANDLER_FACTORY,
  createRequestScopedAttemptMcpHandler,
} from './adapter/in/http/runtime/attempt-mcp-http.controller';
import { McpHttpResponseAdapter } from './adapter/in/http/runtime/mcp-http-response.adapter';
import { RunnerControlController } from './adapter/in/http/runtime/runner-control.controller';

/** Internal loopback-only HTTP surface consumed by the native Host Runner. */
@Module({
  imports: [AgentRuntimeApplicationModule],
  controllers: [RunnerControlController, AttemptMcpHttpController],
  providers: [
    { provide: McpHttpResponseAdapter, useFactory: () => new McpHttpResponseAdapter() },
    { provide: ATTEMPT_MCP_HANDLER_FACTORY, useValue: createRequestScopedAttemptMcpHandler },
  ],
})
export class AgentOsRuntimeHttpModule {}
