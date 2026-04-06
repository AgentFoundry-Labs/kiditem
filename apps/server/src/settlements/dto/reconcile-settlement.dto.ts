import { IsString, IsOptional } from 'class-validator';

export class ReconcileSettlementDto {
  @IsString()
  period: string;

  @IsString() @IsOptional()
  companyId?: string;
}
