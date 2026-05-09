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
  ALERT_SEVERITIES,
  type AlertSeverity,
} from '@kiditem/shared/alerts';

const HREF_PATTERN = /^\//;

/**
 * `POST /api/operation-alerts/start` body — frontend producers (extension
 * scrapes, browser-initiated long-running flows) call this to register an
 * `Alert.kind='operation'` row. The controller accepts only known
 * type/sourceType/sourceId producer tuples and canonicalizes user-facing
 * title/href server-side; client-supplied tenant fields are not declared here
 * and are stripped by the global `ValidationPipe`.
 */
export class StartOperationAlertDto {
  @IsString() @MinLength(1) @MaxLength(200)
  operationKey!: string;

  @IsString() @MinLength(1) @MaxLength(64)
  type!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  message?: string | null;

  @IsString() @MinLength(1) @MaxLength(64)
  sourceType!: string;

  @IsOptional() @IsString() @MaxLength(200)
  sourceId?: string | null;

  @IsString() @MinLength(1) @MaxLength(1024) @Matches(HREF_PATTERN, {
    message: 'href must be a same-origin path starting with /',
  })
  href!: string;

  @IsOptional() @IsIn(ALERT_SEVERITIES as readonly string[])
  severity?: AlertSeverity;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  progress?: number | null;

  @IsOptional() @IsObject()
  metadata?: Record<string, unknown>;
}
