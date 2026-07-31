// Shared DOM utilities for coupang-ads-scraper content scripts
// Loaded via manifest.json js array before content scripts

function showBadge(text, color) {
  const badgeId = "kiditem-badge";
  let el = document.getElementById(badgeId);
  if (!el) {
    el = document.createElement("div");
    el.id = badgeId;
    el.style.cssText =
      "position:fixed;top:12px;right:12px;background:#0f172a;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:999999;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:-apple-system,sans-serif;transition:opacity 0.5s;";
    document.body.appendChild(el);
  }
  el.style.color = color || "#22c55e";
  el.textContent = text;
  el.style.opacity = "1";
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 500);
  }, 5000);
}
