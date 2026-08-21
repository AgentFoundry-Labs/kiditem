import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendAgentMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(12000)
  content!: string;
}

export class SelectSourcingRecommendationDto {
  @IsString()
  @IsNotEmpty()
  artifactId!: string;
}
