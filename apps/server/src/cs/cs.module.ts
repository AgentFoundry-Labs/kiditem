import { Module } from '@nestjs/common';
import { CsController } from './cs.controller';
import { CsService } from './cs.service';

@Module({
  controllers: [CsController],
  providers: [CsService],
})
export class CsModule {}
