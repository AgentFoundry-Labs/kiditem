import { searchWingCatalogProducts } from '../wing-catalog-extension';

export async function collect() {
  return searchWingCatalogProducts({ keyword: '문구', maxPages: 1 });
}
