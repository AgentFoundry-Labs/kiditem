import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import type { RocketInventoryEventType } from '@kiditem/shared/inventory';

const ROCKET_EVENT_TYPES: RocketInventoryEventType[] = [
  'reserve',
  'release',
  'issue',
  'return_restock',
];

export class RocketInventoryEventDto {
  @IsUUID() inventoryId!: string;
  @IsUUID() optionId!: string;
  @IsIn(ROCKET_EVENT_TYPES) eventType!: RocketInventoryEventType;
  @IsInt() @Min(1) quantity!: number;
  @IsString() @MaxLength(200) sourceActionId!: string;
  @IsString() @MaxLength(50) sourceType!: string;
  @IsString() @MaxLength(200) sourceRef!: string;
  @IsOptional() @IsInt() @Min(0) openReservationQty?: number;
  @IsOptional() @IsBoolean() allowOverReservation?: boolean;
  @IsOptional() @IsString() @MaxLength(500) overrideReason?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
