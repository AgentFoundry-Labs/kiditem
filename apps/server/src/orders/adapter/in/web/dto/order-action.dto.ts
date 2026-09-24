import { IsString, IsInt, IsArray, ArrayMinSize, IsIn, ValidateIf, Min, Max } from 'class-validator';

export class OrderActionBodyDto {
  @IsIn(['confirm', 'invoice'])
  action: string;

  // shipmentBoxId 는 Coupang 외부 ID. JS Number 안전 범위 (Number.MAX_SAFE_INTEGER) 를 넘으면
  // 캐스팅 반올림으로 다른 ID 로 외부 API 가 나갈 수 있어 DTO 단계에서 거부.
  @ValidateIf(o => o.action === 'confirm')
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(Number.MAX_SAFE_INTEGER, { each: true })
  shipmentBoxIds?: number[];

  @ValidateIf(o => o.action === 'invoice')
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  shipmentBoxId?: number;

  @ValidateIf(o => o.action === 'invoice')
  @IsString()
  deliveryCompanyCode?: string;

  @ValidateIf(o => o.action === 'invoice')
  @IsString()
  invoiceNumber?: string;
}
