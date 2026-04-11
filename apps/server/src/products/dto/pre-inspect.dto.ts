import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class PreInspectDto {
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  productIds?: string[];
}
