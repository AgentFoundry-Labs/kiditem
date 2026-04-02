import { IsIn, IsOptional, IsObject } from 'class-validator';

const VALID_AGENTS = [
  'inventory_check', 'sourcing_scraper', 'content', 'image_edit',
  'listing', 'pricing', 'cs', 'ad_strategy', 'rules_evaluation',
] as const;

export class CreateAgentTaskBodyDto {
  @IsIn(VALID_AGENTS)
  agentType: string;

  @IsObject() @IsOptional() input?: Record<string, unknown>;
}
