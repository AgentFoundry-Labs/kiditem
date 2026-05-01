import { IsString } from 'class-validator';

/**
 * organizationId 는 `req.authUser.organizationId` 에서 주입 — DTO 에는 포함하지 않는다.
 * (ADR-0006)
 */
export class ReconcileSettlementDto {
  @IsString()
  period: string;
}
