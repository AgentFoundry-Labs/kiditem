import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// jsdom 에는 ResizeObserver 가 없다. 크기를 재는 화면(가로로 넘치는 표의 위쪽
// 스크롤바 등)이 테스트에서 터지지 않게 관측만 받아 두는 빈 구현을 채운다.
// 실제 크기 변화는 jsdom 에서 일어나지 않으므로 콜백은 부르지 않는다.
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in window)) {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverStub,
  })
  globalThis.ResizeObserver = ResizeObserverStub
}
