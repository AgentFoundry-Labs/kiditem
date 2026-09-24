import { IsString, MaxLength, MinLength } from 'class-validator';

export class SaveDetailPageEditedHtmlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000_000)
  html!: string;
}

export class RenameDetailPageVersionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;
}
