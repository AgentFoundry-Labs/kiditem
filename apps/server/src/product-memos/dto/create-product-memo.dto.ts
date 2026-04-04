import { IsString, IsOptional, IsUUID, MinLength } from 'class-validator';

export class CreateProductMemoDto {
  @IsUUID() productId: string;
  @IsString() @MinLength(1) content: string;
  @IsString() @IsOptional() author?: string;
  @IsString() @IsOptional() memoType?: string;
}
