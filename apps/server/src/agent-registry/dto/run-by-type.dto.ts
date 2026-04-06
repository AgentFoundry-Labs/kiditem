import { IsString, IsOptional, IsUUID } from 'class-validator';

export class RunByTypeBodyDto {
  @IsString() type: string;
  @IsUUID() @IsOptional() companyId?: string;
}
