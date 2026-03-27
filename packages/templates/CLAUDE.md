# packages/templates — 상세페이지 템플릿

쿠팡 상품 상세페이지용 React 템플릿 컴포넌트 + Zod 스키마.

## 빌드

```bash
npm run build       # tsup + tailwind CSS 컴파일
npm run dev         # watch mode
```

## 템플릿 2종

| ID | 이름 | 설명 |
|---|---|---|
| `bold-vertical` | 볼드 세로형 | 큰 타이포, 강렬한 색상, 포인트 뱃지 |
| `simple-vertical` | 심플 세로형 | 따뜻한 톤, 넘버링 키포인트, 섹션 on/off |

## 사용

```typescript
import { getTemplate, parseDetailPageData } from '@kiditem/templates';

const config = getTemplate('bold-vertical');
const data = parseDetailPageData(apiResponse);
const Component = config.component;

<Component data={data} />
```

## DetailPageData 구조

```
title, subtitle, description[], badge
hookText, hookTitleSub, hookSubtext
price, originalPrice, discountRate
images[], heroBanner, sizeImages[], detailImages[]
keyPoints[], bulletPoints[], features[], specs[]
csInfo: { phone, kakao, refundRules[] }
themeColor*, layout.components[]
```

## 규칙

- `parseDetailPageData()`: snake_case API 응답 → camelCase 변환
- 테마 커스텀: CSS custom properties (`--theme-color-main` 등)
- `layout.components[].enabled`: 섹션별 표시/숨김
- 패키지명: `@kiditem/templates`
