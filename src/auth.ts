// HTTP auth gate. Verifies the bearer token via Google OAuth tokeninfo and
// returns the verified Google email as the caller's identity. There is no
// fallback path — invalid tokens always 401.
//
// Pattern mirrors method-consultant-mcp/src/auth.ts.

import type { GoogleAuthResult } from './platform/googleAuth.js';

export type Verifier = (token: string) => Promise<GoogleAuthResult>;

export type HttpAuthResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'missing' | 'malformed' | 'invalid' };

export async function verifyHttpAuth(
  headerValue: string | undefined | null,
  verifier: Verifier,
): Promise<HttpAuthResult> {
  if (!headerValue || headerValue.length === 0) {
    return { ok: false, reason: 'missing' };
  }
  if (!headerValue.startsWith('Bearer ')) {
    return { ok: false, reason: 'malformed' };
  }
  const token = headerValue.slice('Bearer '.length);
  if (token.length === 0 || /^\s/.test(token)) {
    return { ok: false, reason: 'malformed' };
  }

  const g = await verifier(token);
  if (g.ok) {
    return { ok: true, email: g.email };
  }
  return { ok: false, reason: 'invalid' };
}
