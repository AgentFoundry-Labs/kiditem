import { IsOptional, IsString } from 'class-validator';

export class UpdateCoupangAccountSettingsDto {
  @IsString()
  vendorId!: string;

  @IsString()
  @IsOptional()
  accessKey?: string;

  @IsString()
  @IsOptional()
  secretKey?: string;
}
