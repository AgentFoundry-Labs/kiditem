import { IsString, IsOptional, IsUUID, IsObject, MinLength } from 'class-validator';

export class ManagerAskBodyDto {
  @IsUUID() companyId: string;
  @IsString() @MinLength(1) request: string;
  @IsUUID() @IsOptional() productId?: string;
  @IsObject() @IsOptional() context?: Record<string, unknown>;
}
