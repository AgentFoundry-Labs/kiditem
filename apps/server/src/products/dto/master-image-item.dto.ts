import { IsInt, IsString, IsUrl, Min } from 'class-validator';

export class MasterImageItemDto {
  @IsUrl()
  url!: string;

  @IsString()
  role!: string;

  @IsString()
  label!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}
