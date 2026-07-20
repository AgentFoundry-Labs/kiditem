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
