// Page-world extraction output is untrusted. This policy is deliberately
// dependency-free so it can be loaded before the sourcing worker and tested in
// an isolated service-worker context.
var KiditemSourcingUrlPolicy = (() => {
  const ALLOWED_SUFFIXES = ['1688.com', 'alibaba.com'];

  function isAllowedHost(hostname) {
    const normalized = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return ALLOWED_SUFFIXES.some((suffix) =>
      normalized === suffix || normalized.endsWith(`.${suffix}`),
    );
  }

  function parseAllowedSupplierUrl(value) {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:') throw new Error('supplier_url_https_required');
    if (parsed.username || parsed.password) throw new Error('supplier_url_userinfo_forbidden');
    if (parsed.port && parsed.port !== '443') throw new Error('supplier_url_port_forbidden');
    if (!isAllowedHost(parsed.hostname)) throw new Error('supplier_url_host_forbidden');
    parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    parsed.hash = '';
    return parsed.toString();
  }

  return Object.freeze({ isAllowedHost, parseAllowedSupplierUrl });
})();

// Compatibility alias for test harnesses or an unpacked worker that had loaded
// the early spelling during this release train. New callers use Kiditem… only.
var KidItemSourcingUrlPolicy = KiditemSourcingUrlPolicy;
