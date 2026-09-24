import { IsString } from 'class-validator';

export class UpdateCoupangAccountSettingsDto {
  @IsString()
  vendorId!: string;
}
