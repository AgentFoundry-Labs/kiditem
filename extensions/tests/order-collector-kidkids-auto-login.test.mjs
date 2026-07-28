import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} closing brace not found`);
}

const source = readFileSync(
  new URL("../order-collector/background/service-worker.js", import.meta.url),
  "utf8",
);

function loadEnsureMallLogin({ scanResults, tabUrls }) {
  let scanIndex = 0;
  let urlIndex = 0;
  const ensureMallLoginSource = extractFunction(source, "ensureMallLogin").replace(
    /^function /,
    "async function ",
  );
  const ensureMallLogin = vm.runInNewContext(
    `(${ensureMallLoginSource})`,
    {
      autoSubmitIcecreamMallLogin: () => undefined,
      chrome: {
        scripting: {
          async executeScript() {
            const result = scanResults[Math.min(scanIndex, scanResults.length - 1)];
            scanIndex += 1;
            return [{ result }];
          },
        },
        tabs: {
          async get() {
            const url = tabUrls[Math.min(urlIndex, tabUrls.length - 1)];
            urlIndex += 1;
            return { id: 17, url };
          },
        },
      },
      delay: async () => undefined,
      waitForTabReady: async () => undefined,
    },
  );
  return { ensureMallLogin, getScanCount: () => scanIndex };
}

test("kidkids waits through the initial management redirect and submits the eventual login form", async () => {
  const { ensureMallLogin, getScanCount } = loadEnsureMallLogin({
    scanResults: [{ state: "no-login-form" }, { state: "submitted" }],
    tabUrls: [
      "https://partner.kidkids.net/new/pages/logis/management.htm",
      "https://www.kidkids.net/join/partner_login.htm",
    ],
  });

  const result = await ensureMallLogin(
    17,
    { loginId: "configured-id", password: "configured-password" },
    "kidkids",
  );

  assert.equal(result.success, true);
  assert.equal(result.submitted, true);
  assert.equal(getScanCount(), 2);
});

test("kidkids personal verification is returned as an operator login requirement", async () => {
  const { ensureMallLogin } = loadEnsureMallLogin({
    scanResults: [{ state: "no-login-form" }],
    tabUrls: ["https://partner.kidkids.net/new/pages/security/verify_user.htm"],
  });

  const result = await ensureMallLogin(
    17,
    { loginId: "configured-id", password: "configured-password" },
    "kidkids",
  );

  assert.equal(result.success, false);
  assert.equal(result.pendingLogin, true);
  assert.match(result.error, /본인 인증/);
});
