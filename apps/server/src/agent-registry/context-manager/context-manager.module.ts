import { Module } from '@nestjs/common';
import { CompressorService } from './compressor.service';

@Module({
  providers: [CompressorService],
  exports: [CompressorService],
})
export class ContextManagerModule {}
