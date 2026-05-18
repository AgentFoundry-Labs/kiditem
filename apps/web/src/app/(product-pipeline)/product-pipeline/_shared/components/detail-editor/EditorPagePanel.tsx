'use client';

import type { DragEvent, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useEditor } from '@grapesjs/react';
import {
  Barcode,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  MousePointer2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type GjsComponent = any;

interface PageDefinition {
  id: string;
  label: string;
  selectors: string[];
  textIncludes?: string[];
  fallbackSectionIndex?: number;
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
    selectors: ['[data-section="hero"]', '[data-field="heroBanner"]', '[data-field="heroImage"]'],
    fallbackSectionIndex: 0,
  },
  {
    id: 'point',
    label: '포인트',
    selectors: ['[data-section="point"]', '[data-field="sectionName"]', '[data-field="sectionTitle"]', '[data-field="sectionSubtitle"]'],
    textIncludes: ['POINT'],
  },
  {
    id: 'size',
    label: '사이즈',
    selectors: ['[data-section="sizeImages"]', '[data-container="sizeImages"]'],
    textIncludes: ['제품 사이즈', '사이즈 안내', '사이즈 및 구성품'],
  },
  {
    id: 'color',
    label: '색상',
    selectors: ['[data-section="colorImages"]', '[data-container="colorImages"]'],
    textIncludes: ['색상 안내'],
  },
  {
    id: 'usage',
    label: '사용법',
    selectors: ['[data-section="usageImages"]', '[data-container="usageImages"]'],
    textIncludes: ['사용법 안내'],
  },
  {
    id: 'detail',
    label: '디테일컷',
    selectors: ['[data-section="detailImages"]', '[data-container="detailImages"]', '[data-field="detailText"]'],
    textIncludes: ['DETAIL', '디테일 이미지'],
  },
  {
    id: 'safety',
    label: '제품안전 표시',
    selectors: ['[data-section="specs"]', '[data-container="productInfo"]'],
    textIncludes: ['INFO', '상품 정보 고시', '제품 안전 특별법', '품질표시'],
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
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [dragOverPageId, setDragOverPageId] = useState<string | null>(null);

  const collectPages = useCallback(() => {
    const wrapper = editor.getWrapper();
    if (!wrapper) {
      setPages([]);
      return;
    }
    const selected = editor.getSelected();
    const componentsInDocumentOrder = flattenComponents(wrapper);
    const orderByComponent = new Map<GjsComponent, number>();
    componentsInDocumentOrder.forEach((component, index) => {
      orderByComponent.set(component, index);
    });
    const summaries = PAGE_DEFINITIONS.map((definition, index) =>
      summarizePage(definition, index, wrapper),
    ).sort((a, b) => {
      const aOrder = a.target ? orderByComponent.get(a.target) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const bOrder = b.target ? orderByComponent.get(b.target) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    }).map((page, index) => ({ ...page, index }));
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

  const refreshPages = useCallback(() => {
    requestAnimationFrame(collectPages);
  }, [collectPages]);

  const movePage = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      const sourcePage = pages.find((page) => page.id === sourceId);
      const targetPage = pages.find((page) => page.id === targetId);
      if (!sourcePage?.target || !targetPage?.target) return;

      const sourceParent = sourcePage.target.parent?.();
      const targetParent = targetPage.target.parent?.();
      if (!sourceParent || !targetParent) return;

      const sourceIndex = sourcePage.target.index?.() ?? 0;
      const targetIndex = targetPage.target.index?.() ?? 0;
      const definition = sourcePage.target.toJSON?.();
      if (!definition) return;

      sourcePage.target.remove();
      const insertAt =
        sourceParent === targetParent && sourceIndex < targetIndex
          ? Math.max(0, targetIndex - 1)
          : targetIndex;
      const result = targetParent.components().add(definition, { at: insertAt });
      const moved = Array.isArray(result) ? result[0] : result;
      if (moved) editor.select(moved);
      refreshPages();
    },
    [editor, pages, refreshPages],
  );

  const togglePageHidden = useCallback(
    (page: PageItem) => {
      if (!page.target) return;
      if (page.hidden) {
        page.target.removeStyle?.('display');
      } else {
        page.target.addStyle?.({ display: 'none' });
      }
      editor.select(page.target);
      refreshPages();
    },
    [editor, refreshPages],
  );

  const removePage = useCallback(
    (page: PageItem) => {
      if (!page.target) return;
      page.target.remove();
      refreshPages();
    },
    [refreshPages],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="space-y-2">
        {pages.map((page) => (
          <div
            key={page.id}
            role="button"
            tabIndex={page.target ? 0 : -1}
            aria-disabled={!page.target}
            draggable={Boolean(page.target)}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onDragStart={(event: DragEvent<HTMLDivElement>) => {
              if (!page.target) return;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', page.id);
              setDraggingPageId(page.id);
            }}
            onDragOver={(event: DragEvent<HTMLDivElement>) => {
              if (!page.target || !draggingPageId || draggingPageId === page.id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDragOverPageId(page.id);
            }}
            onDragLeave={(event: DragEvent<HTMLDivElement>) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDragOverPageId((current) => (current === page.id ? null : current));
            }}
            onDrop={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              event.stopPropagation();
              const sourceId = draggingPageId ?? event.dataTransfer.getData('text/plain');
              if (sourceId && page.target) movePage(sourceId, page.id);
              setDraggingPageId(null);
              setDragOverPageId(null);
            }}
            onDragEnd={() => {
              setDraggingPageId(null);
              setDragOverPageId(null);
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              selectPage(page);
            }}
            onKeyDown={(event) => {
              if (!page.target || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              event.stopPropagation();
              selectPage(page);
            }}
            className={cn(
              'group flex w-full items-stretch gap-3 rounded-xl border bg-white p-2 text-left transition',
              page.selected
                ? 'border-slate-600 shadow-sm ring-1 ring-slate-300'
                : page.target
                  ? 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  : 'cursor-not-allowed border-slate-100 opacity-50',
              page.target && 'cursor-grab active:cursor-grabbing',
              dragOverPageId === page.id && 'border-emerald-400 bg-emerald-50/40 ring-1 ring-emerald-200',
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
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="mb-0.5 flex min-w-0 items-center gap-1.5">
                    {page.target && (
                      <GripVertical
                        size={13}
                        className="shrink-0 text-slate-300 transition group-hover:text-slate-500"
                        aria-hidden
                      />
                    )}
                    <span className="shrink-0 text-[10px] font-bold text-slate-400">
                      페이지 {page.index + 1}
                    </span>
                    <p className="truncate text-sm font-black text-slate-800">{page.label}</p>
                    {page.selected && <MousePointer2 size={11} className="shrink-0 text-slate-500" />}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-4 text-slate-400">
                    {page.target ? page.title : page.subtitle}
                  </p>
                </div>
                {page.target && (
                  <div className="flex shrink-0 items-center gap-1">
                    <PageActionButton
                      title={page.hidden ? '섹션 보이기' : '섹션 숨기기'}
                      onClick={() => togglePageHidden(page)}
                    >
                      {page.hidden ? <Eye size={12} /> : <EyeOff size={12} />}
                    </PageActionButton>
                    <PageActionButton
                      title="섹션 삭제"
                      tone="danger"
                      onClick={() => removePage(page)}
                    >
                      <X size={13} strokeWidth={2.4} />
                    </PageActionButton>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageActionButton({
  children,
  title,
  tone = 'default',
  onClick,
}: {
  children: ReactNode;
  title: string;
  tone?: 'default' | 'danger';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      draggable={false}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors',
        tone === 'danger'
          ? 'border-rose-100 bg-rose-50 text-rose-500 hover:border-rose-200 hover:bg-rose-100'
          : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-800',
      )}
    >
      {children}
    </button>
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
    if (match) return preferPageTarget(match, wrapper, definition, true);
  }

  const textMatch = findTextFallbackMatch(definition, wrapper);
  if (textMatch) {
    return preferPageTarget(textMatch, wrapper, definition, false);
  }

  if (definition.fallbackSectionIndex !== undefined) {
    const sections = findDocumentSections(wrapper);
    return sections[definition.fallbackSectionIndex] ?? null;
  }

  return null;
}

function preferPageTarget(
  component: GjsComponent,
  wrapper: GjsComponent,
  definition: PageDefinition,
  allowNearestSection: boolean,
): GjsComponent {
  const sectionRoot = preferDefinitionSectionAncestor(component, wrapper, definition);
  if (sectionRoot) return sectionRoot;
  if (allowNearestSection) return preferNearestSectionAncestor(component, wrapper);
  return preferFallbackBlockAncestor(component, wrapper);
}

function preferNearestSectionAncestor(component: GjsComponent, wrapper: GjsComponent): GjsComponent {
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

function preferDefinitionSectionAncestor(
  component: GjsComponent,
  wrapper: GjsComponent,
  definition: PageDefinition,
): GjsComponent | null {
  let current = component;
  while (current && current !== wrapper) {
    if (componentMatchesDefinition(current, definition)) {
      return current;
    }
    current = current.parent?.() ?? null;
  }
  return null;
}

function preferFallbackBlockAncestor(component: GjsComponent, wrapper: GjsComponent): GjsComponent {
  let current = component;
  let fallback = component;
  while (current && current !== wrapper) {
    if (hasAnyPageMarker(current) && current !== component) return fallback;
    if (isBlockComponent(current)) fallback = current;
    current = current.parent?.() ?? null;
  }
  return fallback;
}

function findTextFallbackMatch(definition: PageDefinition, wrapper: GjsComponent): GjsComponent | null {
  const tokens = definition.textIncludes ?? [];
  if (tokens.length === 0) return null;

  return flattenComponents(wrapper)
    .filter((component) => textIncludesAny(extractText(component), tokens))
    .map((component) => ({
      component,
      depth: getComponentDepth(component, wrapper),
      hasChildMatch: componentHasChildTextMatch(component, tokens),
      textLength: extractText(component).length,
    }))
    .sort((a, b) => {
      if (a.hasChildMatch !== b.hasChildMatch) return a.hasChildMatch ? 1 : -1;
      if (a.depth !== b.depth) return b.depth - a.depth;
      return a.textLength - b.textLength;
    })[0]?.component ?? null;
}

function componentMatchesDefinition(component: GjsComponent, definition: PageDefinition): boolean {
  const attrs = component.getAttributes?.() ?? {};
  const section = attrs['data-section'];
  const container = attrs['data-container'];
  if (definition.id === 'hero') return section === 'hero';
  if (definition.id === 'point') return section === 'point';
  if (definition.id === 'size') return section === 'sizeImages' || container === 'sizeImages';
  if (definition.id === 'color') return section === 'colorImages' || container === 'colorImages';
  if (definition.id === 'usage') return section === 'usageImages' || container === 'usageImages';
  if (definition.id === 'detail') return section === 'detailImages' || container === 'detailImages';
  if (definition.id === 'safety') return section === 'specs' || container === 'productInfo';
  if (definition.id === 'barcode') return container === 'safetyLabelImages';
  return false;
}

function hasAnyPageMarker(component: GjsComponent): boolean {
  const attrs = component.getAttributes?.() ?? {};
  const section = attrs['data-section'];
  const container = attrs['data-container'];
  return Boolean(section || container);
}

function isBlockComponent(component: GjsComponent): boolean {
  const tag = String(component.get?.('tagName') ?? '').toLowerCase();
  return tag === 'div' || tag === 'section' || tag === 'article' || tag === 'header' || tag === 'footer' || tag === 'main';
}

function textIncludesAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

function componentHasChildTextMatch(component: GjsComponent, tokens: string[]): boolean {
  const children = component.components?.()?.models ?? [];
  return children.some((child: GjsComponent) => textIncludesAny(extractText(child), tokens));
}

function findDocumentSections(wrapper: GjsComponent): GjsComponent[] {
  const topLevelSections = wrapper.find?.('section') ?? [];
  if (topLevelSections.length > 0) return topLevelSections;
  return (wrapper.components?.()?.models ?? []).filter(isBlockComponent);
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
