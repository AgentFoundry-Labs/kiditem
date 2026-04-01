import { IsString, MinLength } from 'class-validator';

export class RenderImageBodyDto {
  @IsString() @MinLength(1) html: string;
}
