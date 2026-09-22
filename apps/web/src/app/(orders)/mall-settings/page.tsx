import { redirect } from 'next/navigation';

/**
 * 쇼핑몰 계정은 쇼핑몰 현황의 설정 창으로 합쳤다(사장님 2026-09-19). 예전 주소는 모든 몰의 계정 창을 연다. 편집
 * 부품(`components/` · `hooks/` · `lib/`)은 계정 행의 작성자인 주문수집 쪽에 그대로 둔다.
 */
export default function MallSettingsPage() {
  redirect('/mall-channels?account=all');
}
