import { IsOptional, IsString } from 'class-validator';

export class SyncOrdersBodyDto {
  @IsString() @IsOptional() from?: string;
  @IsString() @IsOptional() to?: string;
}
