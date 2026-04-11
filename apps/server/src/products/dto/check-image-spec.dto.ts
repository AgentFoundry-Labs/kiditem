import { IsString } from 'class-validator';

export class CheckImageSpecDto {
  @IsString()
  imageUrl: string;
}
