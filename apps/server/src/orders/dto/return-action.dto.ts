import { IsNumber, Equals } from 'class-validator';

export class ReturnActionBodyDto {
  @Equals('approve')
  action: string;

  @IsNumber()
  receiptId: number;
}
