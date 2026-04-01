import { IsString, IsOptional, MinLength } from 'class-validator';

export class OntologyProductsQueryDto {
  @IsString() @MinLength(1) category: string;
  @IsString() @IsOptional() brand?: string;
}
