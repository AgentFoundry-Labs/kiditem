import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { OntologyService } from './ontology.service';

@Controller('ontology')
export class OntologyController {
  constructor(private readonly ontologyService: OntologyService) {}

  @Get('graph')
  getGraph() {
    return this.ontologyService.getGraph();
  }

  @Get('products')
  getProducts(
    @Query('category') category: string,
    @Query('brand') brand?: string,
  ) {
    if (!category) throw new BadRequestException('category is required');
    return this.ontologyService.getProducts(category, brand);
  }
}
