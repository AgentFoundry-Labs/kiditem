import { IsDefined } from 'class-validator';

export class UpdateAdConfigDto {
  @IsDefined() value: unknown;
}
