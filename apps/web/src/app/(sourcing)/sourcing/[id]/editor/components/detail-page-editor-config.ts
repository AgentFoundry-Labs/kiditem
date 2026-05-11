import type { ComponentProps } from 'react';
import type GjsEditor from '@grapesjs/react';

const CANVAS_CSS = `
  html, body {
    overflow-y: auto !important;
  }
  *, html, body {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }
  *::-webkit-scrollbar {
    display: none !important;
  }
  .gjs-selected {
    outline: 2px solid rgba(16, 185, 129, 0.85) !important;
    outline-offset: -1px;
  }
  .gjs-selected-parent {
    outline: 1px solid rgba(167, 243, 208, 0.5) !important;
  }
  .gjs-hovered {
    outline: 1px dashed rgba(16, 185, 129, 0.5) !important;
    outline-offset: -1px;
  }
  .gjs-dashed *[data-gjs-highlightable] {
    outline: 1px dashed rgba(16, 185, 129, 0.25);
    outline-offset: -1px;
  }
`;

export const GJS_THEME_CSS = `
  .gjs-cv-canvas,
  .gjs-cv-canvas *,
  .gjs-frame-wrapper,
  .gjs-frame-wrapper * {
    scrollbar-width: none !important;
  }
  .gjs-cv-canvas::-webkit-scrollbar,
  .gjs-cv-canvas *::-webkit-scrollbar,
  .gjs-frame-wrapper::-webkit-scrollbar,
  .gjs-frame-wrapper *::-webkit-scrollbar {
    display: none !important;
  }

  .gjs-one-bg { background-color: transparent !important; }
  .gjs-two-color { color: #374151 !important; }
  .gjs-three-bg { background-color: #f9fafb !important; }
  .gjs-four-color, .gjs-four-color-h:hover { color: #10b981 !important; }

  .gjs-field {
    background-color: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 6px !important;
    color: #374151 !important;
    box-shadow: none !important;
  }
  .gjs-field input, .gjs-field select { color: #374151 !important; }

  .gjs-layers { background: transparent !important; }
  .gjs-layer { background: transparent !important; }
  .gjs-layer.gjs-selected .gjs-layer-name { color: #059669 !important; }
  .gjs-layer-title { background: transparent !important; border-bottom: 1px solid #f3f4f6 !important; }
  .gjs-layer-title-inn { color: #374151 !important; }
  .gjs-layer-name { color: #4b5563 !important; font-size: 12px !important; }
  .gjs-layer-count { color: #9ca3af !important; }
  .gjs-layer-vis { color: #9ca3af !important; }
  .gjs-layer-caret { border-left-color: #9ca3af !important; }

  .gjs-sm-sectors { background: transparent !important; }
  .gjs-sm-sector { border-bottom: 1px solid #e5e7eb !important; }
  .gjs-sm-sector-title {
    background-color: #f9fafb !important;
    color: #374151 !important;
    border-bottom: 1px solid #e5e7eb !important;
  }
  .gjs-sm-sector-caret { border-left-color: #6b7280 !important; }
  .gjs-sm-label { color: #6b7280 !important; font-size: 11px !important; }
  .gjs-sm-property { color: #374151 !important; }
  .gjs-sm-composite .gjs-sm-label { color: #9ca3af !important; }

  .gjs-trt-traits { background: transparent !important; }
  .gjs-trt-trait { border-bottom: 1px solid #f3f4f6 !important; padding: 5px 0 !important; }
  .gjs-trt-trait .gjs-label { color: #6b7280 !important; font-size: 11px !important; }

  .gjs-btn-prim {
    background-color: #10b981 !important;
    color: white !important;
    border-radius: 6px !important;
  }
  .gjs-btn-prim:hover { background-color: #059669 !important; }

  .gjs-radio-item input:checked + .gjs-radio-item-label {
    background-color: #10b981 !important;
    color: white !important;
  }

  .gjs-field-color-picker { border-radius: 4px !important; }

  .gjs-rte-toolbar {
    background-color: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 8px !important;
    padding: 4px 6px !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important;
  }
  .gjs-rte-toolbar .gjs-rte-btn {
    color: #374151 !important;
    border-radius: 4px !important;
  }
  .gjs-rte-toolbar .gjs-rte-btn:hover {
    background-color: #f3f4f6 !important;
  }
  .gjs-rte-toolbar .gjs-rte-active {
    background-color: #ecfdf5 !important;
    color: #059669 !important;
  }

  .gjs-editor-cont ::-webkit-scrollbar { width: 5px; height: 5px; }
  .gjs-editor-cont ::-webkit-scrollbar-track { background: transparent; }
  .gjs-editor-cont ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
`;

type GrapesJsOptions = ComponentProps<typeof GjsEditor>['options'];

export const GRAPESJS_OPTIONS: GrapesJsOptions = {
  storageManager: false,
  blockManager: {
    blocks: [
      {
        id: 'heading1',
        label: 'H1 제목',
        category: '기본',
        content: '<h1 style="font-size:32px;font-weight:bold;padding:10px;">제목을 입력하세요</h1>',
      },
      {
        id: 'heading2',
        label: 'H2 부제목',
        category: '기본',
        content: '<h2 style="font-size:24px;font-weight:bold;padding:10px;">부제목을 입력하세요</h2>',
      },
      {
        id: 'text-block',
        label: '본문',
        category: '기본',
        content: '<p style="font-size:16px;line-height:1.6;padding:10px;">본문 텍스트를 입력하세요.</p>',
      },
      {
        id: 'rectangle',
        label: '사각형',
        category: '도형',
        content: '<div style="width:200px;height:150px;border:2px solid #d1d5db;"></div>',
      },
      {
        id: 'circle-shape',
        label: '원형',
        category: '도형',
        content: '<div style="width:150px;height:150px;border-radius:50%;border:2px solid #d1d5db;"></div>',
      },
      {
        id: 'image',
        label: '이미지',
        category: '기본',
        // display:block + margin auto 로 가운데 정렬. 이전엔 default img (inline) 라
        // canvas 의 좌측에 쏠려 보이던 문제 (사용자: "왼쪽이 쏠려있더라").
        content: {
          type: 'image',
          style: {
            display: 'block',
            'margin-left': 'auto',
            'margin-right': 'auto',
            width: '100%',
            'max-width': '600px',
            padding: '10px',
          },
        },
      },
      {
        id: 'line',
        label: '선',
        category: '도형',
        content: '<hr style="border:none;border-top:2px solid #d1d5db;width:100%;" />',
      },
    ],
  },
  panels: { defaults: [] },
  styleManager: {
    sectors: [
      {
        name: '레이아웃',
        open: true,
        properties: ['display', 'width', 'height', 'min-height', 'padding', 'margin'],
      },
      {
        name: '타이포그래피',
        open: false,
        properties: ['font-family', 'font-size', 'font-weight', 'color', 'line-height', 'text-align'],
      },
      {
        name: '배경',
        open: false,
        properties: ['background-color', 'background-image', 'background-size', 'background-position'],
      },
      {
        name: '테두리',
        open: false,
        properties: ['border', 'border-radius', 'box-shadow'],
      },
      {
        name: '효과',
        open: false,
        properties: ['opacity', 'transform'],
      },
    ],
  },
  selectorManager: { componentFirst: true },
  noticeOnUnload: false,
  avoidInlineStyle: true,
  canvasCss: CANVAS_CSS,
  undoManager: { maximumStackLength: 50 },
  deviceManager: {
    devices: [
      { id: 'detail-640', name: '상세페이지 640', width: '640px' },
      { id: 'detail-720', name: '상세페이지 720', width: '720px' },
      { id: 'detail-860', name: '상세페이지 860', width: '860px' },
    ],
  },
};
