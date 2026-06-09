// MCP server route — Vercel + Next.js + mcp-handler pattern.
// Tool implementations live in src/methodApi.ts (unchanged).
// This file wires those implementations into the MCP handler and gates the
// HTTP transport with Google OAuth (RFC 9728 Protected Resource Metadata).
// Auth pattern mirrors method-consultant-mcp.

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import {
  getAccountsByIds,
  getAccountsNeedingClassification,
  getClassificationForAccount,
  getContactsForAccount,
  getRecentClassifications,
  markClassificationReviewed,
  OPERATING_MODELS,
  writeV7Classification,
} from '../../../src/methodApi';
import { verifyHttpAuth, type Verifier } from '../../../src/auth';
import { verifyGoogleToken } from '../../../src/platform/googleAuth';

// Boot-time env read. Throws on cold start if any required var is missing.
// .trim() guards against trailing newlines that `echo | vercel env add` introduces.
function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Required env var ${name} is not set`);
  }
  return v.trim();
}

function parseAllowedEmails(raw: string | undefined): Set<string> | undefined {
  if (!raw || raw.trim() === '') return undefined;
  const set = new Set<string>();
  for (const part of raw.split(',')) {
    const email = part.trim().toLowerCase();
    if (email) set.add(email);
  }
  return set.size > 0 ? set : undefined;
}

const GOOGLE_OAUTH_CLIENT_ID = requiredEnv('GOOGLE_OAUTH_CLIENT_ID');
const ALLOWED_EMAIL_DOMAIN = requiredEnv('ALLOWED_EMAIL_DOMAIN');
const ALLOWED_EMAILS = parseAllowedEmails(process.env['ALLOWED_EMAILS']);

const googleVerifier: Verifier = (token) =>
  verifyGoogleToken(token, {
    expectedAudience: GOOGLE_OAUTH_CLIENT_ID,
    allowedDomain: ALLOWED_EMAIL_DOMAIN,
    allowedEmails: ALLOWED_EMAILS,
  });

async function authGate(req: Request): Promise<Response | null> {
  const r = await verifyHttpAuth(req.headers.get('authorization'), googleVerifier);
  if (r.ok) return null;
  // TEMPORARY: surface the rejection reason in logs + body so we can debug
  // the Claude.ai connector handshake. Revert to opaque error after fix.
  console.error('[authGate] rejected:', r.reason, 'header present:', !!req.headers.get('authorization'));
  const base = new URL(req.url).origin;
  const metadataUrl = `${base}/.well-known/oauth-protected-resource`;
  return new Response(JSON.stringify({ error: 'unauthorized', reason: r.reason }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': `Bearer realm="${base}/api/mcp", resource_metadata="${metadataUrl}"`,
    },
  });
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'get_accounts_needing_v7_classification',
      'Returns Method customer accounts that need V7 industry classification. Filters to active, paying, non-test, non-Methoder accounts and excludes internal/template account names. By default also excludes accounts that already have a row in CustomerIndustryClassification (so each call returns only fresh work). Sorted by newest RecordID first.',
      {
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe('Max accounts to return (default 200, max 500)'),
        exclude_already_classified: z
          .boolean()
          .optional()
          .describe('When true (default), filters out accounts that already have a classification row. Set to false to include re-runs.'),
      },
      async ({ limit, exclude_already_classified }) => {
        const accounts = await getAccountsNeedingClassification(
          limit ?? 200,
          exclude_already_classified ?? true,
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: accounts.length, accounts }, null, 2),
            },
          ],
        };
      },
    );

    server.tool(
      'get_accounts_by_ids',
      'Fetch full classification-ready data for a specific list of Method account RecordIDs. Use for drift studies, targeted re-classification, and review-loop reclassification. Returns the same fields as get_accounts_needing_v7_classification, but does NOT apply the internal-account or active-paying filter — you get exactly the rows you asked for.',
      {
        account_record_ids: z
          .array(z.number().int().positive())
          .min(1)
          .max(500)
          .describe('List of CustomerMethodAccount RecordIDs to fetch (1–500).'),
      },
      async ({ account_record_ids }) => {
        const accounts = await getAccountsByIds(account_record_ids);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: accounts.length, accounts }, null, 2),
            },
          ],
        };
      },
    );

    server.tool(
      'get_contacts_for_account',
      'Pull up to 20 contacts linked to an account via Entity_RecordID. Implements Step 1a-bis of the V7 classification pipeline: when the primary CustomerEmail is freemail (gmail/yahoo/etc.), partner-managed (DeveloperCompanyName set), or Method-internal (method.me/methodintegration.com), use this tool to find an alternate contact whose email domain reveals the real customer business. The caller applies the rule "keep the first email whose domain is NOT freemail, method.me, methodintegration.com, OR the primary account email domain."',
      {
        account_record_id: z
          .number()
          .int()
          .positive()
          .describe('CustomerMethodAccount RecordID. Maps to Contacts.Entity_RecordID.'),
      },
      async ({ account_record_id }) => {
        const contacts = await getContactsForAccount(account_record_id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: contacts.length, contacts }, null, 2),
            },
          ],
        };
      },
    );

    server.tool(
      'get_recent_classifications',
      'Browse classifications from the CustomerIndustryClassification table, most recent first. Use to review yesterday\'s output, audit low-confidence calls, filter by OperatingModel or L1, etc. Returns full classification rows with reasoning.',
      {
        limit: z.number().int().positive().max(100).optional().describe('Max rows to return (default 20, max 100)'),
        since_date: z.string().optional().describe('Filter to classifications made on or after this date (ISO 8601, e.g. "2026-05-25" or "2026-05-25T00:00:00Z")'),
        needs_review_only: z.boolean().optional().describe('Only return rows where NeedsReview is true'),
        min_confidence: z.number().min(0).max(1).optional().describe('Minimum Confidence (0.0–1.0)'),
        max_confidence: z.number().min(0).max(1).optional().describe('Maximum Confidence (0.0–1.0) — useful for finding low-confidence rows to review'),
        operating_model: z.enum(OPERATING_MODELS).optional().describe('Filter by OperatingModel value'),
        l1: z.string().optional().describe('Filter by L1 label exactly (e.g. "Manufacturing & Distribution")'),
      },
      async (args) => {
        const rows = await getRecentClassifications(args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ count: rows.length, classifications: rows }, null, 2) }],
        };
      },
    );

    server.tool(
      'get_classification_for_account',
      'Drill into the classification for a specific account. Pass either the AccountRecordID (preferred — exact match) or the AccountFriendlyName (substring, case-insensitive — useful when you only remember the company name). Returns both the classification and the source account row for context.',
      {
        account_record_id: z.number().int().positive().optional().describe('The CustomerMethodAccount RecordID (preferred)'),
        account_friendly_name: z.string().optional().describe('Substring of AccountFriendlyName (case-SENSITIVE — Method\'s OData doesn\'t support tolower). First match wins. If you only know the name in mixed case, try the most likely capitalization.'),
      },
      async (args) => {
        const result = await getClassificationForAccount(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.tool(
      'mark_classification_reviewed',
      'Toggle the NeedsReview flag on an existing classification row. Use needs_review=false to confirm a classification is correct as-is; use needs_review=true to flag a row that needs another look. To change L1/L2/L3/etc., call write_v7_classification with the corrected values instead (UPSERT will overwrite the row).',
      {
        account_record_id: z.number().int().positive().describe('The CustomerMethodAccount RecordID whose classification you\'re marking'),
        needs_review: z.boolean().describe('false = reviewed and correct, true = flag for further review'),
      },
      async (args) => {
        const result = await markClassificationReviewed(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.tool(
      'write_v7_classification',
      'Writes a V7 classification result to the CustomerIndustryClassification table. The destination table is hardcoded — this tool can never write to any other table. Upsert behavior: if a row already exists for the given account_record_id, it is updated; otherwise a new row is created. This enforces one current classification per account.',
      {
        account_record_id: z
          .number()
          .int()
          .positive()
          .describe('Source account RecordID (from CustomerMethodAccount). Required.'),
        l1: z.string().min(1).max(255).describe('V7 L1 label (e.g., "Manufacturing & Distribution")'),
        l2: z.string().min(1).max(255).describe('V7 L2 label (e.g., "Industrial Manufacturing")'),
        l3: z.string().min(1).max(255).describe('V7 L3 label (the full V7 L3 name)'),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Final confidence score, 0.00–1.00'),
        version: z
          .string()
          .max(20)
          .optional()
          .describe('Taxonomy version (e.g., "V7.1")'),
        classified_at: z
          .string()
          .optional()
          .describe('Full ISO 8601 datetime (e.g., "2026-05-25T18:25:00Z") of when classification was made. If omitted or if a date-only string is passed, the server uses the current time.'),
        needs_review: z
          .boolean()
          .optional()
          .describe('True when confidence < 0.55 or rule-flagged'),
        content_source: z
          .string()
          .max(50)
          .optional()
          .describe('Enrichment source that drove the label: web_fetch | bbb_search | search_verified | search_snippet | clay_only | name_only | name_override | pre_enriched'),
        business_description: z
          .string()
          .max(500)
          .optional()
          .describe('1–2 sentence summary of what the business does'),
        short_reasoning: z
          .string()
          .max(500)
          .optional()
          .describe('One sentence on why this L1/L2/L3 was chosen'),
        confidence_reason: z
          .string()
          .max(500)
          .optional()
          .describe('One sentence explaining the confidence number'),
        evidence_urls: z
          .string()
          .max(1000)
          .optional()
          .describe('Comma-separated URLs of evidence (websites, BBB pages, LinkedIn, etc.)'),
        operating_model: z
          .enum(OPERATING_MODELS)
          .optional()
          .describe('Operating model — orthogonal classification dimension capturing HOW the account goes to market. One of: B2B_Producer | B2B_Distributor | DTC_Producer | Hybrid_Producer | Pure_Retailer | Service_Only | Service_With_Products | Project_Services | Hospitality. See V7-Pipeline-Spec §15 for definitions and tiebreakers.'),
      },
      async (args) => {
        const result = await writeV7Classification(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    );
  },
  {},
  { basePath: '/api' },
);

async function authedHandler(req: Request): Promise<Response> {
  const blocked = await authGate(req);
  if (blocked) return blocked;
  return handler(req);
}

// CORS preflight: claude.ai connector is server-to-server, but we export
// OPTIONS explicitly and gate it the same as everything else. Fail closed.
export async function OPTIONS(req: Request): Promise<Response> {
  const blocked = await authGate(req);
  if (blocked) return blocked;
  return new Response(null, { status: 204 });
}

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };

export const maxDuration = 30;
