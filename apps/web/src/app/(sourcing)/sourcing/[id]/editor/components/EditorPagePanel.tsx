'use client';

import { useCallback, useEffect, useState } from 'react';
import { useEditor } from '@grapesjs/react';
import { Barcode, Image as ImageIcon, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type GjsComponent = any;

interface PageDefinition {
  id: string;
  label: string;
  selectors: string[];
  textIncludes?: string[];
}

interface PageItem {
  id: string;
  index: number;
  label: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  selected: boolean;
  hidden: boolean;
  target: GjsComponent | null;
}

const PAGE_DEFINITIONS: PageDefinition[] = [
  {
    id: 'hero',
    label: '히어로',
    selectors: ['[data-field="heroBanner"]', '[data-field="heroImage"]'],
  },
  {
    id: 'point',
    label: '포인트',
    selectors: ['[data-field="sectionName"]', '[data-field="sectionTitle"]', '[data-field="sectionSubtitle"]'],
  },
  {
    id: 'size',
    label: '사이즈',
    selectors: ['[data-section="sizeImages"]', '[data-container="sizeImages"]'],
    textIncludes: ['사이즈 안내'],
  },
  {
    id: 'color',
    label: '색상',
    selectors: ['[data-section="colorImages"]', '[data-container="colorImages"]'],
    textIncludes: ['색상 안내'],
  },
  {
    id: 'detail',
    label: '디테일컷',
    selectors: ['[data-section="detailImages"]', '[data-container="detailImages"]', '[data-field="detailText"]'],
    textIncludes: ['DETAIL'],
  },
  {
    id: 'safety',
    label: '제품안전 표시',
    selectors: [],
    textIncludes: ['제품 안전 특별법', '품질표시'],
  },
  {
    id: 'barcode',
    label: '바코드',
    selectors: ['[data-container="safetyLabelImages"]'],
    textIncludes: ['KC', '바코드'],
  },
];

export default function EditorPagePanel() {
  const editor = useEditor();
  const [pages, setPages] = useState<PageItem[]>([]);

  const collectPages = useCallback(() => {
    const wrapper = editor.getWrapper();
    if (!wrapper) {
      setPages([]);
      return;
    }
    const selected = editor.getSelected();
    const summaries = PAGE_DEFINITIONS.map((definition, index) =>
      summarizePage(definition, index, wrapper),
    );
    const activePageId = findActivePageId(summaries, selected, wrapper);
    setPages(summaries.map((page) => ({ ...page, selected: page.id === activePageId })));
  }, [editor]);

  useEffect(() => {
    collectPages();
    const events = [
      'update',
      'component:add',
      'component:remove',
      'component:update',
      'component:selected',
      'component:deselected',
    ];
    events.forEach((event) => editor.on(event, collectPages));
    return () => events.forEach((event) => editor.off(event, collectPages));
  }, [collectPages, editor]);

  const selectPage = useCallback(
    (page: PageItem) => {
      if (!page.target) return;
      editor.select(page.target);
      requestAnimationFrame(() => scrollComponentIntoCanvasView(editor, page.target));
    },
    [editor],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="space-y-2">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              selectPage(page);
            }}
            disabled={!page.target}
            className={cn(
              'group flex w-full items-stretch gap-3 rounded-xl border bg-white p-2 text-left transition',
              page.selected
                ? 'border-slate-600 shadow-sm ring-1 ring-slate-300'
                : page.target
                  ? 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  : 'cursor-not-allowed border-slate-100 opacity-50',
              page.hidden && 'opacity-50',
            )}
          >
            <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
              {page.imageUrl ? (
                <img src={page.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : page.id === 'barcode' ? (
                <Barcode size={17} className="text-slate-300" />
              ) : (
                <ImageIcon size={16} className="text-slate-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400">
                  페이지 {page.index + 1}
                </span>
                {page.selected && <MousePointer2 size={11} className="text-slate-500" />}
              </div>
              <p className="truncate text-sm font-black text-slate-800">{page.label}</p>
              <p className="mt-1 line-clamp-2 text-xs font-medium leading-4 text-slate-400">
                {page.target ? page.title : page.subtitle}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function scrollComponentIntoCanvasView(editor: ReturnType<typeof useEditor>, component: GjsComponent) {
  const frame = editor.Canvas.getFrameEl();
  const frameWindow = frame?.contentWindow;
  const element = component?.getEl?.();
  if (!frameWindow || !element) return;

  const rect = element.getBoundingClientRect();
  const viewportHeight = frameWindow.innerHeight || frame?.clientHeight || 900;
  const nextTop = Math.max(
    0,
    frameWindow.scrollY + rect.top - viewportHeight / 2 + rect.height / 2,
  );
  frameWindow.scrollTo({ top: nextTop, behavior: 'auto' });
}

function summarizePage(
  definition: PageDefinition,
  index: number,
  wrapper: GjsComponent,
): PageItem {
  const target = findPageTarget(definition, wrapper);
  const text = target ? extractText(target) : '';
  const [primary, secondary] = splitPreviewText(text);
  const title = primary || definition.label;
  const imageUrl = target
    ? findPageImageUrl(definition, target) ?? buildTextThumbnail(definition.label, title)
    : null;
  return {
    id: definition.id,
    index,
    label: definition.label,
    title,
    subtitle: target ? secondary || '상세페이지 구성 페이지' : '아직 섹션이 없습니다',
    imageUrl,
    selected: false,
    hidden: target ? isComponentHidden(target) : false,
    target,
  };
}

function findActivePageId(
  pages: PageItem[],
  selected: GjsComponent | null,
  wrapper: GjsComponent,
): string | null {
  if (!selected) return null;
  let activeId: string | null = null;
  let activeDepth = -1;

  pages.forEach((page) => {
    if (!page.target) return;
    if (page.target !== selected && !isAncestor(page.target, selected, wrapper)) return;
    const depth = getComponentDepth(page.target, wrapper);
    if (depth >= activeDepth) {
      activeId = page.id;
      activeDepth = depth;
    }
  });

  return activeId;
}

function findPageTarget(definition: PageDefinition, wrapper: GjsComponent): GjsComponent | null {
  for (const selector of definition.selectors) {
    const match = wrapper.find?.(selector)?.[0];
    if (match) return preferPageTarget(match, wrapper, definition);
  }
  for (const token of definition.textIncludes ?? []) {
    const match = flattenComponents(wrapper).find((component) => extractText(component).includes(token));
    if (match) return preferPageTarget(match, wrapper, definition);
  }
  return null;
}

function preferPageTarget(
  component: GjsComponent,
  wrapper: GjsComponent,
  definition: PageDefinition,
): GjsComponent {
  if (definition.id === 'point') return preferContentBlockAncestor(component, wrapper);
  return preferSectionAncestor(component, wrapper);
}

function preferContentBlockAncestor(component: GjsComponent, wrapper: GjsComponent): GjsComponent {
  let current = component;
  let candidate = component;
  while (current && current !== wrapper) {
    const tag = String(current.get?.('tagName') ?? '').toLowerCase();
    if (tag === 'section') return candidate;
    candidate = current;
    current = current.parent?.() ?? null;
  }
  return candidate;
}

function preferSectionAncestor(component: GjsComponent, wrapper: GjsComponent): GjsComponent {
  let current = component;
  while (current && current !== wrapper) {
    const attrs = current.getAttributes?.() ?? {};
    if (attrs['data-section'] || attrs['data-container']) return current;
    current = current.parent?.() ?? null;
  }

  current = component;
  while (current && current !== wrapper) {
    const tag = String(current.get?.('tagName') ?? '').toLowerCase();
    if (tag === 'section') return current;
    current = current.parent?.() ?? null;
  }
  return component;
}

function flattenComponents(root: GjsComponent): GjsComponent[] {
  const result: GjsComponent[] = [];
  const walk = (component: GjsComponent) => {
    result.push(component);
    const children = component.components?.()?.models ?? [];
    children.forEach(walk);
  };
  const children = root.components?.()?.models ?? [];
  children.forEach(walk);
  return result;
}

function splitPreviewText(text: string): string[] {
  return text
    .split(/\s{2,}|[|｜]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function extractText(component: GjsComponent): string {
  const html = component.toHTML?.() ?? '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function findPageImageUrl(definition: PageDefinition, target: GjsComponent): string | null {
  if (definition.id === 'point' || definition.id === 'safety') return null;
  return findFirstImageUrl(target);
}

function findFirstImageUrl(component: GjsComponent): string | null {
  if (isComponentHidden(component)) return null;
  const attrs = component.getAttributes?.() ?? {};
  if (isImageComponent(component) && typeof attrs.src === 'string' && attrs.src) return attrs.src;
  const children = component.components?.()?.models ?? [];
  for (const child of children) {
    const found = findFirstImageUrl(child);
    if (found) return found;
  }
  return null;
}

function isImageComponent(component: GjsComponent): boolean {
  const tag = String(component.get?.('tagName') ?? '').toLowerCase();
  const type = String(component.get?.('type') ?? '').toLowerCase();
  return tag === 'img' || type === 'image';
}

function isComponentHidden(component: GjsComponent): boolean {
  const style = component.getStyle?.() ?? {};
  if (style.display === 'none') return true;
  const attrs = component.getAttributes?.() ?? {};
  return String(attrs.class ?? '')
    .split(/\s+/)
    .includes('hidden');
}

function buildTextThumbnail(label: string, title: string): string {
  const safeLabel = escapeSvg(label);
  const safeTitle = escapeSvg(title === label ? '상세페이지 섹션' : title);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="128" viewBox="0 0 160 128">
      <rect width="160" height="128" rx="18" fill="#f8fafc"/>
      <rect x="18" y="20" width="124" height="14" rx="7" fill="#dbeafe"/>
      <text x="80" y="67" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="800" fill="#0f172a">${safeLabel}</text>
      <text x="80" y="91" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="#94a3b8">${safeTitle.slice(0, 18)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isAncestor(ancestor: GjsComponent, node: GjsComponent, wrapper: GjsComponent): boolean {
  let current = node;
  while (current && current !== wrapper) {
    if (current === ancestor) return true;
    current = current.parent?.() ?? null;
  }
  return false;
}

function getComponentDepth(component: GjsComponent, wrapper: GjsComponent): number {
  let depth = 0;
  let current = component;
  while (current && current !== wrapper) {
    depth += 1;
    current = current.parent?.() ?? null;
  }
  return depth;
}
