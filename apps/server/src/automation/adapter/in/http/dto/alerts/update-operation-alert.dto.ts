import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ALERT_OPERATION_LIFECYCLE_STATUSES,
  ALERT_SEVERITIES,
  type AlertOperationLifecycleStatus,
  type AlertSeverity,
} from '@kiditem/shared/alerts';

const HREF_PATTERN = /^\//;

/**
 * `PATCH /api/operation-alerts/:operationKey` body — drives a previously
 * started operation alert through `running` / `succeeded` / `failed` /
 * `cancelled`. The terminal statuses set `finishedAt` server-side; the
 * caller does not supply it.
 *
 * `organizationId` is bound to the caller via `@CurrentOrganization()`, so
 * an `(operationKey, organizationId)` mismatch resolves to "no row" and
 * the controller returns 404 — never cross-tenant updates.
 */
export class UpdateOperationAlertDto {
  @IsIn(ALERT_OPERATION_LIFECYCLE_STATUSES as readonly string[])
  status!: AlertOperationLifecycleStatus;

  @IsOptional() @IsString() @MaxLength(2000)
  message?: string | null;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(1024) @Matches(HREF_PATTERN, {
    message: 'href must be a same-origin path starting with /',
  })
  href?: string | null;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  progress?: number | null;

  @IsOptional() @IsIn(ALERT_SEVERITIES as readonly string[])
  severity?: AlertSeverity;

  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}
