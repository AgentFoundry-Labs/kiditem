import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body DTO for `POST /api/sourcing/candidates/:id/reject`.
 *
 * Per apps/server/AGENTS.md global HTTP rules, `organizationId` is NEVER
 * accepted in the body — it comes from `@CurrentOrganization()`.
 *
 * `reason` is a free-form audit note (D3 — rejected candidate row is preserved
 * with `rejectedReason`, `rejectedAt`, `rejectedByUserId`). MaxLength caps
 * pathological input.
 */
export class RejectCandidateBodyDto {
  @IsOptional() @IsString() @MaxLength(2000)
  reason?: string;
}
