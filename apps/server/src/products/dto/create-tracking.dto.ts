import { IsString, IsNumber } from 'class-validator';

export class CreateTrackingDto {
  @IsString()
  companyId!: string;

  @IsString()
  productId!: string;

  @IsString()
  generationId!: string;

  @IsString()
  originalGrade!: string;

  @IsNumber()
  originalScore!: number;
}
