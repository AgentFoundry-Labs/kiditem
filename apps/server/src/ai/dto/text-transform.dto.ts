import { IsString, IsOptional, MinLength } from 'class-validator';

export class TextTransformBodyDto {
  @IsString() @MinLength(1) text: string;
  @IsString() preset: string;
  @IsString() @IsOptional() custom_prompt?: string;
}
