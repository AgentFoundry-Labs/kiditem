import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsIn,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ChannelOptionRecipeComponentDto {
  @IsUUID()
  masterProductId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ReplaceChannelOptionRecipeDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChannelOptionRecipeComponentDto)
  components!: ChannelOptionRecipeComponentDto[];

  /** The recipe the screen loaded; the server answers 409 when the option no longer has it. */
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChannelOptionRecipeComponentDto)
  expectedComponents!: ChannelOptionRecipeComponentDto[];
}

export class ChannelOptionRecipeCandidateQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  search!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsIn(['in_stock', 'all'])
  stockStatus: 'in_stock' | 'all' = 'in_stock';
}
