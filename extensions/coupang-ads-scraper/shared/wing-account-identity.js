// Deterministic WING session identity guard. It intentionally reads only
// public page signals (DOM/meta/URL), never cookies or opaque page state.
(function (root) {
  'use strict';

  const VENDOR_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

  function normalizedVendorId(value) {
    const candidate = typeof value === 'string' ? value.trim() : '';
    return VENDOR_ID.test(candidate) ? candidate : null;
  }

  function expectedVendorId(value) {
    const vendorId = normalizedVendorId(value);
    if (!vendorId) {
      return { ok: false, error: 'WING expected vendor identity is missing or invalid.' };
    }
    return { ok: true, vendorId };
  }

  // WING seller console renders the vendor code inside a labeled account element,
  // e.g. `<div class="vendor-id-wrapper">업체코드 A00057379</div>`. The token that
  // follows each "업체코드" label is a vendor id. An unlabeled element contributes
  // no candidates, while multiple labels remain visible to the ambiguity guard.
  function labeledVendorIds(text) {
    if (typeof text !== 'string') return [];
    const matches = text.matchAll(
      /업체코드[\s:]*([A-Za-z0-9][A-Za-z0-9_-]{0,79})/g,
    );
    return Array.from(matches, (match) => match[1]);
  }

  // WING bootstraps its app data in an inline <script> that declares the vendor id
  // (`vendorId: 'A00057379'` or `"vendorId":"A00057379"`). The quoted-only capture
  // intentionally ignores `"vendorId":null` placeholders elsewhere on the page.
  // Keep every match: a script containing more than one account identity must be
  // rejected as ambiguous instead of trusting whichever value appears first.
  function inlineScriptVendorIds() {
    const candidates = [];
    const pattern = /["']?vendorId["']?\s*[:=]\s*["']([A-Za-z0-9][A-Za-z0-9_-]{0,79})["']/g;
    for (const script of document.querySelectorAll('script:not([src])')) {
      const text = script.textContent;
      if (!text || text.indexOf('vendorId') === -1) continue;
      for (const match of text.matchAll(pattern)) candidates.push(match[1]);
    }
    return candidates;
  }

  function pageIdentities() {
    const candidates = [];
    const push = (value, source) => {
      const vendorId = normalizedVendorId(value);
      if (vendorId) candidates.push({ vendorId, source });
    };

    for (const node of document.querySelectorAll('[data-vendor-id]')) {
      push(node.getAttribute('data-vendor-id'), 'dom:data-vendor-id');
    }
    for (const node of document.querySelectorAll('meta[name="vendor-id"], meta[name="vendorId"]')) {
      push(node.getAttribute('content'), 'meta:vendor-id');
    }
    try {
      push(new URL(location.href).searchParams.get('vendorId'), 'url:vendorId');
    } catch (_) {
      // An invalid document URL is an identity absence, never a fallback.
    }
    // WING seller-web pages carry the vendor id only in the rendered account
    // menu and the inline bootstrap script — never in the three signals above.
    for (const node of document.querySelectorAll('.vendor-id-wrapper, .my-user-menu-top')) {
      for (const vendorId of labeledVendorIds(node.textContent)) {
        push(vendorId, 'dom:vendor-code-label');
      }
    }
    for (const vendorId of inlineScriptVendorIds()) {
      push(vendorId, 'dom:inline-script');
    }
    return candidates;
  }

  function verifyExpectedVendorId(expected) {
    const requested = expectedVendorId(expected);
    if (!requested.ok) return requested;
    const identities = pageIdentities();
    const unique = new Map();
    for (const identity of identities) unique.set(identity.vendorId, identity.source);
    if (unique.size !== 1) {
      return {
        ok: false,
        error: unique.size === 0
          ? 'WING account identity is unavailable; refusing to mutate the page.'
          : 'WING account identity is ambiguous; refusing to mutate the page.',
      };
    }
    const [vendorId, source] = unique.entries().next().value;
    if (vendorId !== requested.vendorId) {
      return { ok: false, error: 'WING account identity does not match the approved account.' };
    }
    return { ok: true, vendorId, source };
  }

  root.KidItemWingAccountIdentity = Object.freeze({
    normalizedVendorId,
    verifyExpectedVendorId,
  });
})(globalThis);
