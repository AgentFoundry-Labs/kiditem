import { IsNumber, Min, Max } from 'class-validator';

export class UpdateTrustLevelDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  trustLevel: number;
}
