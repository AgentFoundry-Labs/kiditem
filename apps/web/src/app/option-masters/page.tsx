import { redirect } from 'next/navigation';

// Legacy route alias — canonical UI lives at /products/options (R2). Kept as a
// permanent server-side redirect so any old bookmarks resolve to the
// product-owned management page instead of the deleted gating screen.
export default function OptionMastersRedirectPage(): never {
  redirect('/products/options');
}
