// Verifies a Google access token via the tokeninfo endpoint. Returns the
// verified email on success, or a typed reason on failure.
//
// Pattern mirrors method-consultant-mcp/src/platform/googleAuth.ts.

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

export interface GoogleAuthConfig {
  expectedAudience: string;
  allowedDomain: string;
  // Optional. When set, the verified email (lowercased) MUST be in this set
  // in addition to passing the domain check. When undefined, the domain check
  // alone gates access.
  allowedEmails?: Set<string> | undefined;
}

export type GoogleAuthResult =
  | { ok: true; email: string }
  | {
      ok: false;
      reason:
        | 'invalid'
        | 'audience'
        | 'unverified_email'
        | 'domain'
        | 'not_in_allowlist'
        | 'transport';
    };

interface Deps {
  fetch?: (url: string) => Promise<{ status: number; json(): Promise<any> }>;
}

export async function verifyGoogleToken(
  accessToken: string,
  cfg: GoogleAuthConfig,
  deps: Deps = {},
): Promise<GoogleAuthResult> {
  const fetchFn = deps.fetch ?? (globalThis.fetch as any);
  let res: { status: number; json(): Promise<any> };
  try {
    res = await fetchFn(
      `${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`,
    );
  } catch {
    return { ok: false, reason: 'transport' };
  }
  if (res.status !== 200) {
    return { ok: false, reason: 'invalid' };
  }
  const body = await res.json();
  if (body.aud !== cfg.expectedAudience) {
    console.error('[googleAuth] audience mismatch — token aud:', body.aud, '| expected:', cfg.expectedAudience);
    return { ok: false, reason: 'audience' };
  }
  if (String(body.email_verified) !== 'true') {
    return { ok: false, reason: 'unverified_email' };
  }
  const email = String(body.email ?? '');
  const emailLower = email.toLowerCase();
  if (!emailLower.endsWith(`@${cfg.allowedDomain.toLowerCase()}`)) {
    return { ok: false, reason: 'domain' };
  }
  if (cfg.allowedEmails && !cfg.allowedEmails.has(emailLower)) {
    return { ok: false, reason: 'not_in_allowlist' };
  }
  return { ok: true, email: emailLower };
}
