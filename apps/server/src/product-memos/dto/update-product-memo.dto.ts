import { IsBoolean } from 'class-validator';

export class UpdateProductMemoDto {
  @IsBoolean() isResolved: boolean;
}
