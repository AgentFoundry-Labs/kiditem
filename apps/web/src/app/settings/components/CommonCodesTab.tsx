'use client';

const COMMON_CODES = [
  {
    group: '상품 상태',
    codes: [
      { code: 'draft', label: '초안', description: '소싱 후 미가공 상태' },
      { code: 'processing', label: '가공중', description: 'AI 콘텐츠 생성 진행중' },
      { code: 'processed', label: '가공완료', description: '콘텐츠 생성 완료, 리스팅 대기' },
      { code: 'active', label: '판매중', description: '마켓플레이스 등록 완료' },
      { code: 'inactive', label: '판매중지', description: '일시 판매 중지' },
    ],
  },
  {
    group: '상품 등급',
    codes: [
      { code: 'A', label: 'A등급', description: '핵심상품 (매출 상위)' },
      { code: 'B', label: 'B등급', description: '일반상품' },
      { code: 'C', label: 'C등급', description: '저성과 상품' },
      { code: 'D', label: 'D등급', description: '정리 대상' },
    ],
  },
  {
    group: '주문 상태',
    codes: [
      { code: 'ACCEPT', label: '발주확인', description: '주문 접수 완료' },
      { code: 'INSTRUCT', label: '배송지시', description: '출고 지시 완료' },
      { code: 'DEPARTURE', label: '출고완료', description: '택배사 인수' },
      { code: 'DELIVERING', label: '배송중', description: '배송 진행중' },
      { code: 'FINAL_DELIVERY', label: '배송완료', description: '수취인 수령' },
      { code: 'CANCEL', label: '취소', description: '주문 취소' },
      { code: 'RETURN', label: '반품', description: '반품 접수' },
    ],
  },
];

export default function CommonCodesTab() {
  return (
    <div className="space-y-4">
      {COMMON_CODES.map((group) => (
        <div
          key={group.group}
          className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b border-gray-200 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-gray-900">{group.group}</h3>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr className="bg-gray-50">
                  <th>코드</th>
                  <th>라벨</th>
                  <th>설명</th>
                </tr>
              </thead>
              <tbody>
                {group.codes.map((code) => (
                  <tr key={code.code}>
                    <td>
                      <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-700">
                        {code.code}
                      </code>
                    </td>
                    <td className="font-medium text-gray-900">{code.label}</td>
                    <td className="text-gray-500 text-sm">{code.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
