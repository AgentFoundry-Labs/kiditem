import { IsUUID } from 'class-validator';

/**
 * `GET /api/agent-registry/tasks/:id/trace` path parameter.
 * id 는 AgentTask.id (uuid).
 */
export class TraceParamsDto {
  @IsUUID()
  id!: string;
}
