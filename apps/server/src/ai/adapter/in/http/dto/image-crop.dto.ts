import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsHttpOrDataImageUrl } from './image-edit.dto';

export class ImageCropRectDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99)
  x: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99)
  y: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  width: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  height: number;
}

export class ImageCropBodyDto {
  @IsString()
  @IsHttpOrDataImageUrl()
  imageUrl: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => ImageCropRectDto)
  crop: ImageCropRectDto;
}
