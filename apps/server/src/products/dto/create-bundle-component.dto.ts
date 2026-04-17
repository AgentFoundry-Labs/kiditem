// apps/server/src/products/dto/create-bundle-component.dto.ts
import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateBundleComponentDto {
  @IsUUID()
  bundleOptionId!: string;

  @IsUUID()
  componentOptionId!: string;

  @IsInt() @Min(1)
  qty!: number;
}
