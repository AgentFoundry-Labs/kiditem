import { Transform } from 'class-transformer';
import { Equals, IsIn } from 'class-validator';

export class SellpiaInventoryImportDto {
  @IsIn(['manual'])
  kind!: 'manual';

  @Transform(({ value }) => value === 'true' ? true : value)
  @Equals(true)
  manualFreshExportConfirmed!: true;
}
