import { Module } from '@nestjs/common';
import { UnshippedController } from './unshipped.controller';
import { UnshippedService } from './unshipped.service';

@Module({
  controllers: [UnshippedController],
  providers: [UnshippedService],
})
export class UnshippedModule {}
