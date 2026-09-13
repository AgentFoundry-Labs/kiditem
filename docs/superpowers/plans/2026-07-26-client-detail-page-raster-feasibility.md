# Client Detail Page Raster Feasibility Test Plan

> **For agentic workers:** Execute this plan inline, one task at a time. Do not submit a product to Coupang Wing and do not mutate production data.

**Goal:** Prove whether the approved client-renderer design can turn the currently saved staging detail page into one Wing-ready JPEG on the company computer, using exactly one Chrome DevTools Protocol screenshot call and no server-side Chromium.

**Architecture:** Fetch the existing saved detail-page HTML through the authenticated staging API, render it in a dedicated Chrome tab at the contract width, and call `Page.captureScreenshot` once with `captureBeyondViewport`. Validate the resulting bytes locally. Treat direct bucket upload as a separate contract gate: the browser may upload only to a short-lived, organization-scoped presigned target issued by the server.

**Tech Stack:** Chrome extension/browser runtime, Chrome DevTools Protocol (`Page.getLayoutMetrics`, `Page.captureScreenshot`), staging NestJS API, JPEG validation.

**Global constraints:** Use candidate `472ba5a7-0785-4931-a1e5-112ef1716a5a` and revision `60620087-f5d8-4307-8591-221fd018eaa0`; generate one image, not tiles; do not invoke the current server Puppeteer renderer; do not perform Wing submission; do not expose storage credentials; close the temporary render tab after the test.

## File map

- Read: `docs/superpowers/specs/archive/2026-07-26-client-detail-page-raster-design.md`
- Create during the experiment: one temporary local JPEG outside the repository, deleted after validation unless retained as explicit test evidence.
- No product source files are changed by this feasibility test.

### Task 1: Confirm the exact staging fixture

1. Reuse the user's authenticated staging Chrome session.
2. Request `GET /api/ai/detail-page?sourceCandidateId=472ba5a7-0785-4931-a1e5-112ef1716a5a`.
3. Assert that the response identifies detail page `56b21da3-1df4-43cc-9031-30e88810d094` and revision `60620087-f5d8-4307-8591-221fd018eaa0`.
4. Request `GET /api/ai/detail-page/56b21da3-1df4-43cc-9031-30e88810d094/edited-html` and assert that non-empty saved HTML is returned.
5. Record the HTML byte length without logging authentication state or sensitive headers.

### Task 2: Render the fixture on the company computer

1. Open a dedicated temporary Chrome tab.
2. Install a minimal trusted shell in the tab, insert the saved HTML into a sandboxed document, and wait for `document.fonts.ready`, image completion, and two animation frames.
3. Set the CSS render width so the JPEG output width is exactly 780 pixels.
4. Call `Page.getLayoutMetrics` and record the full CSS content height.
5. Call `Page.captureScreenshot` exactly once with:

```json
{
  "format": "jpeg",
  "quality": 85,
  "fromSurface": true,
  "captureBeyondViewport": true,
  "clip": {
    "x": 0,
    "y": 0,
    "width": 780,
    "height": "<measured full height>",
    "scale": 1
  }
}
```

6. Measure render-ready time, screenshot-call time, total time, base64 length, and decoded byte length.

### Task 3: Validate the single JPEG

1. Decode the screenshot result locally.
2. Assert the JPEG SOI/EOI markers are present.
3. Assert image width is 780 pixels, height is greater than one viewport, and the file is non-empty.
4. Inspect the result for missing sections, blank bands, or obvious clipping.
5. Confirm only one `Page.captureScreenshot` call was issued.

### Task 4: Evaluate the direct-upload boundary

1. Inspect the deployed API contract and repository for an existing presigned upload endpoint that can issue a short-lived target scoped to the current organization, revision, content type, and maximum size.
2. If such an endpoint already exists, upload the validated JPEG to its disposable/test key and verify the returned object metadata without making it the active Wing artifact.
3. If it does not exist, do not upload with server credentials from the browser. Record the missing endpoint as implementation work, not as a failure of client-side rendering.
4. Verify that the approved finalize contract can enforce revision ownership, JPEG content type, width 780, size limit, and idempotency before recording the artifact.

### Task 5: Decision and cleanup

1. Close the dedicated render tab and detach any debugging session.
2. Remove temporary local bytes unless the user needs the visual evidence retained.
3. Classify the design:
   - **Feasible:** one valid 780px full-height JPEG is produced in one CDP call without server rendering.
   - **Feasible with constraint:** capture works, but a browser/Chrome limit requires a documented maximum height or alternative client compositor.
   - **Not feasible:** the real fixture cannot be captured as one valid JPEG in the company Chrome environment.
4. Report timings, dimensions, byte size, screenshot call count, upload-contract status, and any implementation gap.

## Self-review

- Covers the approved design's decisive risk: one-shot full-page JPEG creation on the client.
- Uses the same staging candidate and revision that failed under server resource limits.
- Does not treat IndexedDB as durable storage; it remains only a future retry cache.
- Does not test a split-image path or alter the one-image Wing contract.
- Does not add a server Puppeteer fallback.
- Contains no placeholder product code and makes no production or Wing mutations.
