import { IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCsBodyDto {
  @IsString() csType!: string;
  @IsString() content!: string;

  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() assignee?: string;

  @IsOptional() @IsUUID() orderId?: string;

  @IsOptional() @IsUUID() listingId?: string;

  /** @deprecated Legacy frontend alias — will be removed after Plan D frontend rewire. */
  @IsOptional()
  @IsUUID()
  @Transform(({ value, obj }) => {
    // productId 수신 시 listingId 로 매핑 (listingId 없는 경우만)
    if (value && !obj.listingId) obj.listingId = value;
    return value;
  })
  productId?: string;
}
