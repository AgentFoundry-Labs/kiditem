// SSRF defense for the master image proxy / base64 read path.
//
// The actual policy lives in `apps/server/src/common/security/public-url.ts`
// so the products domain and the ai/thumbnail domain share one
// implementation. This file is preserved as a thin compatibility re-export so
// existing `domain/policy/public-image-url` import paths keep working until
// callers fully switch to the common path.
export {
  PublicUrlError as PublicImageUrlError,
  assertHttpUrl,
  assertPublicHttpUrl,
} from '../../../common/security/public-url';
