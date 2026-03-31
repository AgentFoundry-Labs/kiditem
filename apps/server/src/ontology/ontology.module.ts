import { Module } from '@nestjs/common';
import { OntologyController } from './ontology.controller';
import { OntologyService } from './ontology.service';

@Module({
  controllers: [OntologyController],
  providers: [OntologyService],
})
export class OntologyModule {}
