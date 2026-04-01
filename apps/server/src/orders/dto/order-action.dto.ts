import { IsString, IsNumber, IsArray, ArrayMinSize, IsIn, ValidateIf } from 'class-validator';

export class OrderActionBodyDto {
  @IsIn(['confirm', 'invoice'])
  action: string;

  @ValidateIf(o => o.action === 'confirm')
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  shipmentBoxIds?: number[];

  @ValidateIf(o => o.action === 'invoice')
  @IsNumber()
  shipmentBoxId?: number;

  @ValidateIf(o => o.action === 'invoice')
  @IsString()
  deliveryCompanyCode?: string;

  @ValidateIf(o => o.action === 'invoice')
  @IsString()
  invoiceNumber?: string;
}
