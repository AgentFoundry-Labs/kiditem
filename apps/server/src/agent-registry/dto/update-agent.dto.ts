import { PartialType } from '@nestjs/mapped-types';
import { CreateAgentBodyDto } from './create-agent.dto';

export class UpdateAgentBodyDto extends PartialType(CreateAgentBodyDto) {}
