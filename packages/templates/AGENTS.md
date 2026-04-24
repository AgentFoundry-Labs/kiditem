# packages/templates — Detail Page Templates

React template components + Zod schemas for Coupang product detail pages.

## Build

```bash
npm run build       # tsup + tailwind CSS compilation
npm run dev         # watch mode
```

## Usage

```typescript
import { getTemplate, parseDetailPageData } from '@kiditem/templates';

const config = getTemplate('bold-vertical');
const data = parseDetailPageData(apiResponse);
const Component = config.component;

<Component data={data} />
```

## Rules

- `parseDetailPageData()`: converts snake_case API response → camelCase
- Theme customization: CSS custom properties (`--theme-color-main`, etc.)
- `layout.components[].enabled`: per-section show/hide
- Package name: `@kiditem/templates`
- Adding templates: create `src/templates/{id}/` folder → register in `getTemplate()`
