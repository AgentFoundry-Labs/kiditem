import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();

function source(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('staging sourcing browser deployment', () => {
  it('runs persistent headed Chromium with a private CDP relay and loopback-only operator UI', () => {
    const compose = source('docker-compose.staging.yml');

    assert.match(compose, /^  sourcing-chrome:\n/m);
    assert.match(compose, /ghcr\.io\/linuxserver\/chromium:[^\s]+@sha256:[0-9a-f]{64}/);
    assert.match(compose, /\.env\.staging\.browser/);
    assert.doesNotMatch(compose, /--remote-debugging-address/);
    assert.match(compose, /--remote-debugging-port=9222/);
    assert.match(compose, /--user-data-dir=\/config\/chromium-cdp-profile/);
    assert.match(compose, /127\.0\.0\.1:3001:3000/);
    assert.doesNotMatch(compose, /^\s+- ["']?(?:0\.0\.0\.0:)?9222:9222/m);
    assert.doesNotMatch(compose, /^\s+- ["']?(?:0\.0\.0\.0:)?9223:9223/m);
    assert.match(compose, /sourcing-chrome-profile:\/config/);
    assert.match(compose, /^  sourcing-chrome-profile:\n/m);
    assert.match(compose, /^  sourcing-cdp-proxy:\n/m);
    assert.match(compose, /docker\.io\/alpine\/socat:[^\s]+@sha256:[0-9a-f]{64}/);
    assert.match(compose, /network_mode: ["']service:sourcing-chrome["']/);
    assert.match(compose, /TCP-LISTEN:9223,fork,reuseaddr/);
    assert.match(compose, /TCP:127\.0\.0\.1:9222/);
    assert.match(compose, /sourcing-chrome\.localhost/);
  });

  it('renders and uploads the browser secret while requiring the internal CDP endpoint', () => {
    const renderer = source('deploy/staging/render-runtime-env.sh');
    const workflow = source('.github/workflows/staging-deploy.yml');

    assert.match(renderer, /BROWSER_ENV_FILE=.*\.env\.staging\.browser/);
    assert.match(renderer, /required_browser_env=\([\s\S]*SOURCING_BROWSER_UI_PASSWORD/);
    assert.match(renderer, /required_api_env=\([\s\S]*SOURCING_PLAYWRIGHT_CDP_ENDPOINT/);
    assert.match(renderer, /Rendered .*BROWSER_ENV_FILE/);
    assert.match(workflow, /SOURCING_BROWSER_UI_PASSWORD: \$\{\{ secrets\.STAGING_SOURCING_BROWSER_UI_PASSWORD \}\}/);
    assert.match(workflow, /SOURCING_PLAYWRIGHT_CDP_ENDPOINT: \$\{\{ vars\.STAGING_SOURCING_PLAYWRIGHT_CDP_ENDPOINT \}\}/);
    assert.match(workflow, /\.env\.staging\.api \.env\.staging\.web \.env\.staging\.browser/);
  });

  it('starts and verifies the shared browser before candidate API health succeeds', () => {
    const compose = source('docker-compose.staging.yml');
    const remoteDeploy = source('deploy/staging/remote-deploy.sh');
    const pinnedImages = [
      compose.match(/image: (ghcr\.io\/linuxserver\/chromium:[^\s]+)/)?.[1],
      compose.match(/image: (docker\.io\/alpine\/socat:[^\s]+)/)?.[1],
    ];

    assert.ok(pinnedImages.every(Boolean));
    for (const image of pinnedImages) {
      assert.ok(remoteDeploy.includes(image));
    }

    assert.match(remoteDeploy, /Pulling staging sourcing Chrome image/);
    assert.match(remoteDeploy, /compose up -d sourcing-chrome/);
    assert.match(remoteDeploy, /wait_for_container_health sourcing-chrome/);
    assert.match(remoteDeploy, /wait_for_container_health sourcing-cdp-proxy/);
    assert.match(remoteDeploy, /verify_sourcing_browser_cdp/);
    assert.match(remoteDeploy, /SOURCING_PLAYWRIGHT_CDP_ENDPOINT/);
    assert.match(remoteDeploy, /webSocketDebuggerUrl/);
    assert.match(remoteDeploy, /chromium\.connectOverCDP/);
    assert.match(remoteDeploy, /kiditem-staging-sourcing-chrome/);
  });

  it('documents private operator access, manual verification, and persistent profile recovery', () => {
    const stagingRunbook = source('docs/runbooks/staging-deploy.md');
    const architecture = source('docs/runbooks/deployment-architecture.md');
    const environmentVariables = source('docs/runbooks/environment-variables.md');

    assert.match(stagingRunbook, /ssh -L 3001:127\.0\.0\.1:3001/);
    assert.match(stagingRunbook, /1688.*slider|slider.*1688/is);
    assert.match(stagingRunbook, /kiditem-staging-sourcing-chrome-profile/);
    assert.match(architecture, /sourcing-chrome/);
    assert.match(architecture, /CDP/);
    assert.match(environmentVariables, /STAGING_SOURCING_BROWSER_UI_PASSWORD/);
    assert.match(environmentVariables, /STAGING_SOURCING_PLAYWRIGHT_CDP_ENDPOINT/);
    assert.match(environmentVariables, /http:\/\/sourcing-chrome\.localhost:9223/);
  });
});
