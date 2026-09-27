import { createEsmListings } from '../gmarket/listings';
import { registerSite } from '../registry';

/** 옥션 등록 상품 목록(KID-381) — 지마켓과 같은 ESM Plus 마스터 목록에서 옥션에 올라간 것만(옛 읽기기 그대로). */
registerSite({ name: 'auction', create: (deps) => createEsmListings(deps.tabs, 'auction', '옥션') });
