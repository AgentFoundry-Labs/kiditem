import { IsString, IsOptional, IsArray, IsNumber, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ProductImageItemDto {
  @IsString()
  url: string;

  @IsIn(['box', 'product', 'color_variant', 'detail', 'size_chart'])
  role: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateProductImagesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageItemDto)
  images: ProductImageItemDto[];
}
