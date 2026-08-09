import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateExtensionV2CollectionSessionDto {
  @IsIn(['1688', 'alibaba'])
  sourcePlatform!: '1688' | 'alibaba';

  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  sourceUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  externalOfferId!: string;

  @IsString()
  @MaxLength(300)
  variantKey!: string;
}
