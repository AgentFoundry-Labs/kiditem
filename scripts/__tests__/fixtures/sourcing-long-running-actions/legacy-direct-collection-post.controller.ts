@Controller('sourcing/live-commerce')
export class LegacyDirectCollectionController {
  @Post('taobao/collect')
  collect() {
    return this.liveCommerce.collectTaobao();
  }
}
