import { Module } from '@nestjs/common';
import { OptionMastersController } from './option-masters.controller';
import { OptionMastersService } from './option-masters.service';

@Module({
  controllers: [OptionMastersController],
  providers: [OptionMastersService],
})
export class OptionMastersModule {}
