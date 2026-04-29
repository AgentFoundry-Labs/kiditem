import { IsString } from 'class-validator';

export class UpdateStockTransferDto {
  @IsString() status: string;
}
