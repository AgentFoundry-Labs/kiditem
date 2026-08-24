import { Module } from '@nestjs/common';
import { AgentRuntimeApplicationModule } from '../agent-runtime-application.module';
import { ReadinessStateModule } from '../readiness/readiness-state.module';
import {
  AttemptMcpHttpController,
  ATTEMPT_MCP_HANDLER_FACTORY,
  READINESS_MCP_HANDLER_FACTORY,
  createRequestScopedAttemptMcpHandler,
  createRequestScopedReadinessMcpHandler,
} from './adapter/in/http/runtime/attempt-mcp-http.controller';
import { McpHttpResponseAdapter } from './adapter/in/http/runtime/mcp-http-response.adapter';
import { RunnerControlController } from './adapter/in/http/runtime/runner-control.controller';

/** Internal loopback-only HTTP surface consumed by the native Host Runner. */
@Module({
  imports: [AgentRuntimeApplicationModule, ReadinessStateModule],
  controllers: [RunnerControlController, AttemptMcpHttpController],
  providers: [
    { provide: McpHttpResponseAdapter, useFactory: () => new McpHttpResponseAdapter() },
    { provide: ATTEMPT_MCP_HANDLER_FACTORY, useValue: createRequestScopedAttemptMcpHandler },
    { provide: READINESS_MCP_HANDLER_FACTORY, useValue: createRequestScopedReadinessMcpHandler },
  ],
})
export class AgentOsRuntimeHttpModule {}
