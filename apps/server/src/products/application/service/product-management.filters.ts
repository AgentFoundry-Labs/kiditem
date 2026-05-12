import { Prisma } from '@prisma/client';
import { ListMastersQuery } from '../../dto/list-masters.query';

type CategoryGroupKey = NonNullable<ListMastersQuery['categoryGroup']>;

const CATEGORY_GROUP_FILTERS: Record<CategoryGroupKey, string[]> = {
  season: ['계절용품/시즌용품', '신학기용품', '어린이날', '어버이날/스승의날', '여름용품', '가을운동회', '할로윈데이', '겨울용품', '크리스마스용품', '명절용품/설날/추석'],
  stationery: ['문구용품/노트/문구세트/색종이', '노트/공책/수첩/스케치북', '문구세트', '크레파스/물감', '색종이/색도화지', '화이트보드/메모보드', '팬시스티커', '지우개', '자류/가위/칼', '연필깎이', '풀/본드/접착제', '필기류', '필통', '기타사무용품'],
  toy: ['완구/블록/퍼즐/보드/젤리괴물', '완구', '비눗방울', '블록', '퍼즐', '종이퍼즐', '보드게임', '라켓/캐치볼', '주물럭/젤리괴물/슬라임', '큐브/팽이', '칼라링/슬링키', '탱탱볼/요요볼', '기타활동완구'],
  bag: ['보조가방/책가방/가방류', '보조가방', '크로스백', '비치가방'],
  'music-art-sports': ['음악용품/미술용품/체육용품', '악기류', '미술용품', '색종이/색상지/도화지/마분지', '배드민턴/라켓류', '캐치볼/프로펠라/원반류'],
  learning: ['학습교재/수업교재', '수업교재(종이)', '수업교재(나무)', '수업교재(기타)', '컬러룬(풍선)색칠하기', '색칠놀이(기타)', '역할놀이', '비즈/생크림공예', '십자수/뜨게질', '점토/클레이', '학습교구'],
  fancy: ['팬시/앨범/지갑/거울/악세서리', '팬시', '다용도꽂이/정리함', '앨범/액자', '지갑/동전지갑', '악세서리/반지/목걸이', '포장지류/선물상자', '시계', '저금통', '컵/텀블러/물병', '우산/우비'],
  craft: ['만들기재료/클레이/비즈', '리본/비드/줄/끈', '폼폼이/모루', '고무재료', '나무재료', '종이재료', '천재료', '플라스틱재료', '쇠/핀재료', '찍찍이/벨크로', '스티로폼재료', '기타만들기재료'],
  kindergarten: ['유치원용품/티셔츠/시설교구용품/도시락', '원아수첩/명찰/기타', '앞치마/토시/덧신', '도시락/간식접시/물병', '역할놀이교구/손인형', '시설교구', '단체티셔츠/모자', '상장류', '공부상'],
  snack: ['커피류/시리얼/간식류/사탕류', '시리얼', '과자류', '사탕류', '음료(차)'],
};

export function buildProductManagementMasterWhere(
  organizationId: string,
  q: ListMastersQuery,
  matchingIds: string[] | null,
): Prisma.MasterProductWhereInput {
  const ands: Prisma.MasterProductWhereInput[] = [];
  if (q.search) {
    ands.push({
      OR: [
        { name: { contains: q.search, mode: 'insensitive' } },
        { legacyCode: { contains: q.search } },
        { code: { contains: q.search } },
        { barcode: { contains: q.search } },
      ],
    });
  }
  if (matchingIds !== null) ands.push({ id: { in: matchingIds } });
  if (q.categoryGroup && !q.category) {
    const categories = CATEGORY_GROUP_FILTERS[q.categoryGroup] ?? [];
    if (categories.length > 0) {
      ands.push({
        OR: categories.map((category) => ({
          category: { contains: category, mode: 'insensitive' },
        })),
      });
    }
  }

  return {
    organizationId,
    ...(q.includeDeleted ? {} : { isDeleted: false }),
    OR: [
      { options: { some: { organizationId, isDeleted: false } } },
      { listings: { some: { organizationId, isDeleted: false } } },
    ],
    ...(q.isDeleted !== undefined ? { isDeleted: q.isDeleted } : {}),
    ...(q.isTemporary !== undefined ? { isTemporary: q.isTemporary } : {}),
    ...(q.category ? { category: { contains: q.category, mode: 'insensitive' } } : {}),
    ...(q.brand ? { brand: q.brand } : {}),
    ...(q.abcGrade ? { abcGrade: q.abcGrade } : {}),
    ...(q.lifecycleState ? { lifecycleState: q.lifecycleState } : {}),
    ...(ands.length > 0 ? { AND: ands } : {}),
  };
}
