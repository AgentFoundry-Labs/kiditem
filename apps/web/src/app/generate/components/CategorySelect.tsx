'use client';

import { ChevronDown } from 'lucide-react';

const PRODUCT_CATEGORIES = [
  {
    main: '계절용품/시즌용품',
    sub: [
      '신학기용품',
      '어린이날',
      '어버이날/스승의날',
      '여름용품',
      '가을운동회',
      '할로윈데이',
      '겨울용품',
      '크리스마스용품',
      '명절용품/설날/추석',
    ],
  },
  {
    main: '문구용품/노트/문구세트/색종이',
    sub: [
      '노트/공책/수첩/스케치북',
      '문구세트',
      '크레파스/물감',
      '색종이/색도화지',
      '화이트보드/메모보드',
      '팬시스티커',
      '지우개',
      '자류/가위/칼',
      '연필깎이',
      '풀/본드/접착제',
      '필기류',
      '필통',
      '기타사무용품',
    ],
  },
  {
    main: '완구/블록/퍼즐/보드/젤리괴물',
    sub: [
      '완구',
      '비눗방울',
      '블록',
      '퍼즐',
      '종이퍼즐',
      '보드게임',
      '라켓/캐치볼',
      '주물럭/젤리괴물/슬라임',
      '큐브/팽이',
      '칼라링/슬링키',
      '탱탱볼/요요볼',
      '기타활동완구',
    ],
  },
  {
    main: '보조가방/책가방/가방류',
    sub: ['보조가방', '크로스백', '비치가방'],
  },
  {
    main: '음악용품/미술용품/체육용품',
    sub: [
      '악기류',
      '미술용품',
      '색종이/색상지/도화지/마분지',
      '배드민턴/라켓류',
      '캐치볼/프로펠라/원반류',
    ],
  },
  {
    main: '학습교재/수업교재',
    sub: [
      '수업교재(종이)',
      '수업교재(나무)',
      '수업교재(기타)',
      '컬러룬(풍선)색칠하기',
      '색칠놀이(기타)',
      '역할놀이',
      '비즈/생크림공예',
      '십자수/뜨개질',
      '점토/클레이',
      '학습교구',
    ],
  },
  {
    main: '팬시/앨범/지갑/거울/악세서리',
    sub: [
      '팬시',
      '다용도꽂이/정리함',
      '앨범/액자',
      '지갑/동전지갑',
      '악세서리/반지/목걸이',
      '포장지류/선물상자',
      '시계',
      '저금통',
      '컵/텀블러/물병',
      '우산/우비',
    ],
  },
  {
    main: '만들기재료/클레이/비즈',
    sub: [
      '리본/비드/줄/끈',
      '폼폼이/모루',
      '고무재료',
      '나무재료',
      '종이재료',
      '천재료',
      '플라스틱재료',
      '쇠/핀재료',
      '찍찍이/벨크로',
      '스티로폼재료',
      '기타만들기재료',
    ],
  },
  {
    main: '유치원용품/티셔츠/시설교구용품/도시락',
    sub: [
      '원아수첩/명찰/기타',
      '앞치마/토시/덧신',
      '도시락/간식접시/물병',
      '역할놀이교구/손인형',
      '시설교구',
      '단체티셔츠/모자',
      '상장류',
      '공부상',
    ],
  },
  {
    main: '커피류/시리얼/간식류/사탕류',
    sub: ['시리얼', '과자류', '사탕류', '음료(차)'],
  },
];

interface CategorySelectProps {
  category: string;
  setCategory: (v: string) => void;
}

export default function CategorySelect({ category, setCategory }: CategorySelectProps) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold">
          2
        </div>
        <h2 className="text-xl font-bold text-gray-800">
          추가 설정 (선택 사항)
        </h2>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-bold text-gray-700">
          상품 카테고리
        </label>
        <p className="text-sm text-gray-500 mb-2">
          카테고리를 지정하면 해당 분야에 최적화된 마케팅 용어와 문체가
          적용됩니다.
        </p>
        <div className="relative max-w-md">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-gray-900 focus:outline-none appearance-none transition-colors font-medium text-gray-800"
          >
            <option value="">자동 감지 (권장)</option>
            {PRODUCT_CATEGORIES.map((cat) => (
              <optgroup key={cat.main} label={cat.main}>
                {cat.sub.map((sub) => (
                  <option
                    key={sub}
                    value={`${cat.main} > ${sub}`}
                  >
                    {sub}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            size={20}
          />
        </div>
      </div>
    </section>
  );
}
