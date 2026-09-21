import { Equals } from 'class-validator';

export class ProductSourceBindingDto {
  @Equals('https://kiditem.sellpia.com')
  sourceOrigin!: 'https://kiditem.sellpia.com';

  @Equals('kiditem')
  sourceAccountKey!: 'kiditem';

  @Equals(true)
  confirmed!: true;
}
