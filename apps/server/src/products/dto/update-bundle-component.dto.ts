// apps/server/src/products/dto/update-bundle-component.dto.ts
import { IsInt, Min } from 'class-validator';

export class UpdateBundleComponentDto {
  @IsInt() @Min(1)
  qty!: number;
}
