import { IsUUID } from "class-validator";

export class AuthorizeInteractionNavigationDto {
  @IsUUID()
  actionId!: string;
}
