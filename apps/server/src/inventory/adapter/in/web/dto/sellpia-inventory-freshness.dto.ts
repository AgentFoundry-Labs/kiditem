import { Equals } from 'class-validator';

export class SellpiaInventorySourceBindingRequestDto {
  @Equals('https://kiditem.sellpia.com')
  sourceOrigin!: 'https://kiditem.sellpia.com';

  @Equals('kiditem')
  sourceAccountKey!: 'kiditem';

  @Equals(true)
  confirmed!: true;
}
