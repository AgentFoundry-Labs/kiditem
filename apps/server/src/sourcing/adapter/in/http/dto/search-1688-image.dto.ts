import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class Search1688ImageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  targetId!: string;
}
