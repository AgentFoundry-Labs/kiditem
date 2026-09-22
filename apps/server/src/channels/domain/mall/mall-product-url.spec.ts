import { describe, expect, it } from 'vitest';
import { mallProductUrl } from './mall-product-url';

describe('mallProductUrl', () => {
  it('확인한 규칙으로 몰 매장의 상품 페이지 주소를 만든다', () => {
    expect(mallProductUrl('11st', '9568609387')).toBe('https://www.11st.co.kr/products/9568609387');
    expect(mallProductUrl('lotte-on', 'LO2752600462')).toBe('https://www.lotteon.com/p/product/LO2752600462');
    expect(mallProductUrl('kkomangse', 'Z4323-H8198-O7140')).toBe('https://nstore.edupre.co.kr/?pn=product.view&pcode=Z4323-H8198-O7140');
    expect(mallProductUrl('icecream-mall', '897941')).toBe('https://www.i-screammall.co.kr/goods/detail/897941');
    expect(mallProductUrl('kidkids', '1090904')).toBe('https://mall.kidkids.net/html/product.htm?gc=1090904');
    expect(mallProductUrl('art09', '109704')).toBe('https://art09.co.kr/product/detail.html?product_no=109704');
    expect(mallProductUrl('teacher-mall', '1241718')).toBe('https://shop.teacherville.co.kr/goods/view?no=1241718');
    expect(mallProductUrl('domeggook', '64621152')).toBe('https://domeggook.com/64621152');
    expect(mallProductUrl('thirtymall', '131987854')).toBe('https://thirtymall.com/detail?id=131987854');
  });

  it('ESM 은 사방넷 코드의 앞쪽 사이트상품번호로 연다(옛 옥션 번호도)', () => {
    expect(mallProductUrl('gmarket', '4829864103_6518691205')).toBe('https://item.gmarket.co.kr/Item?goodscode=4829864103');
    expect(mallProductUrl('auction', 'F550178284_6338180986')).toBe('https://itempage3.auction.co.kr/DetailView.aspx?itemno=F550178284');
    expect(mallProductUrl('auction', 'C457971713')).toBe('https://itempage3.auction.co.kr/DetailView.aspx?itemno=C457971713');
  });

  it('쿠팡은 매장 상품번호(productId)가 있을 때만 — 윙 등록상품ID 로는 열리지 않는다', () => {
    expect(mallProductUrl('coupang', '660807605', '196377720')).toBe('https://www.coupang.com/vp/products/196377720');
    expect(mallProductUrl('coupang', '660807605')).toBeNull();
  });

  it('모르는 몰 · 모양이 다른 코드는 추측하지 않는다', () => {
    expect(mallProductUrl('kakao', '779522307')).toBeNull();
    expect(mallProductUrl('smartstore', '13720932232')).toBeNull();
    expect(mallProductUrl('kidsnote', '171770')).toBeNull();
    expect(mallProductUrl('11st', 'LO1234')).toBeNull();
    expect(mallProductUrl('lotte-on', null)).toBeNull();
  });
});
