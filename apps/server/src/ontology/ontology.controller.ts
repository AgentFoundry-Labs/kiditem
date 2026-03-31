import { Controller, Get, Query } from '@nestjs/common';
import { OntologyService } from './ontology.service';
import { OntologyProductsQueryDto } from './dto';

@Controller('ontology')
export class OntologyController {
  constructor(private readonly ontologyService: OntologyService) {}

  @Get('graph')
  getGraph() {
    return this.ontologyService.getGraph();
  }

  @Get('products')
  getProducts(@Query() query: OntologyProductsQueryDto) {
    return this.ontologyService.getProducts(query.category, query.brand);
  }
}
