import { IsIn, IsOptional, IsObject } from 'class-validator';

const VALID_AGENTS = [
  'inventory', 'sourcing', 'content', 'listing', 'pricing', 'cs', 'ad_strategy',
] as const;

export class CreateAgentTaskBodyDto {
  @IsIn(VALID_AGENTS)
  agentType: string;

  @IsObject() @IsOptional() input?: Record<string, unknown>;
}
