import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * organizationId is injected from the auth session and must not appear here.
 */
export class RunAdKeywordAgentBodyDto {
  /**
   * Narrow the run to one advertised product (Coupang vendorItemId). Omit to
   * classify every product's keywords.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalOptionId?: string;
}
