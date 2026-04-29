import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePickingItemDto {
  @IsBoolean() @IsOptional() isPicked?: boolean;
  @IsBoolean() @IsOptional() isVerified?: boolean;
}
