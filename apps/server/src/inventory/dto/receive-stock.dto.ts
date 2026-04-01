import { IsInt, IsPositive } from 'class-validator';

export class ReceiveStockBodyDto {
  @IsInt() @IsPositive() quantity: number;
}
