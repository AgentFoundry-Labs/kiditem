import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AuthorizeInteractionNavigationDto {
  @IsUUID()
  actionId!: string;
}

class InteractionRunEchoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  copilotThreadId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  aguiRunId!: string;

  @IsObject()
  dashboardContext!: Record<string, unknown>;

  @IsObject()
  userEvent!: Record<string, unknown>;
}

export class PrepareInteractionRunIntentDto extends InteractionRunEchoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  agentDefinitionKey!: string;
}

export class AuthorizeInteractionRunDto extends InteractionRunEchoDto {
  @IsString()
  @MinLength(32)
  @MaxLength(4096)
  runIntent!: string;
}

export class AuthorizeInteractionConnectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  copilotThreadId!: string;

  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  cursor?: string;
}

export class AuthorizeCurrentInteractionRunDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  agentDefinitionKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  copilotThreadId!: string;
}
