// Thin wrapper around fetch() for Method API.
// Holds the API key, sets headers, throws on error.
//
// Exported tool implementations are used by:
//   - app/api/mcp/route.ts (Next.js + mcp-handler, deployed to Vercel)
//   - src/local.ts (stdio MCP, for local Claude Code use)

const API_BASE = process.env.METHOD_API_BASE_URL ?? 'https://rest.method.me/api/v1/tables';

function getApiKey(): string {
  const key = process.env.METHOD_API_KEY;
  if (!key) throw new Error('METHOD_API_KEY env var is not set');
  return key;
}

async function methodApi(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `APIKey ${getApiKey()}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Method API ${res.status} ${res.statusText} for ${path}: ${text}`);
  }
  return res;
}

export interface MethodAccount {
  RecordID: number;
  AccountFriendlyName: string;
  CustomerEmail: string;
  CustDatIndustry?: string;
  Vertical?: string | null;
  Sector?: string;
  CustDatCountOfEmployees?: number;
  CustDatAnnualSales?: number;
}

const INTERNAL_NAME_PATTERNS = [
  'template', 'qbo', 'restore', 'paid', 'demo',
  'alocet', 'methodappstore', 'test',
];

function isInternalAccount(name: string): boolean {
  const lc = (name ?? '').toLowerCase();
  if (lc.startsWith('m11') || lc.startsWith('m18')) return true;
  return INTERNAL_NAME_PATTERNS.some((p) => lc.includes(p));
}

export async function getAccountsNeedingClassification(limit = 200): Promise<MethodAccount[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 500);
  // Fetch a wider net so we have room to filter internals client-side.
  const fetchLimit = Math.min(cappedLimit * 3, 500);

  const filter = 'IsActive eq true and IsTestAccount eq false and IsMethoderAccount eq false';
  const select = [
    'RecordID',
    'AccountFriendlyName',
    'CustomerEmail',
    'CustDatIndustry',
    'Vertical',
    'Sector',
    'CustDatCountOfEmployees',
    'CustDatAnnualSales',
  ].join(',');

  const params = new URLSearchParams({
    select,
    filter,
    top: String(fetchLimit),
    orderby: 'RecordID desc',
  });

  const res = await methodApi(`/CustomerMethodAccount?${params.toString()}`);
  const data = (await res.json()) as { count: number; value: MethodAccount[] };

  // Client-side filter against Method-internal/template name patterns
  const real = data.value.filter((a) => !isInternalAccount(a.AccountFriendlyName));
  return real.slice(0, cappedLimit);
}

export interface V7ClassificationInput {
  account_record_id: number;
  l1: string;
  l2: string;
  l3: string;
  confidence?: number;
  version?: string;
  classified_at?: string;          // ISO 8601 datetime
  needs_review?: boolean;
  content_source?: string;
  business_description?: string;
  short_reasoning?: string;
  confidence_reason?: string;
  evidence_urls?: string;
}

export interface WriteV7Result {
  success: true;
  action: 'created' | 'updated';
  record_id: number;               // RecordID of the row in CustomerIndustryClassification
  source_account_record_id: number;
}

// Hardcoded destination — never parameterize this.
const DEST_TABLE = 'CustomerIndustryClassification';

export async function writeV7Classification(input: V7ClassificationInput): Promise<WriteV7Result> {
  // Build the request body — only include fields the caller provided.
  // Method field names match what the user configured in the Tables & Fields UI.
  const body: Record<string, unknown> = {
    AccountRecordID: input.account_record_id,
    L1: input.l1,
    L2: input.l2,
    L3: input.l3,
  };
  if (input.confidence !== undefined) body.Confidence = input.confidence;
  if (input.version) body.Version = input.version;
  if (input.classified_at) body.ClassifiedAt = input.classified_at;
  if (input.needs_review !== undefined) body.NeedsReview = input.needs_review;
  if (input.content_source) body.ContentSource = input.content_source;
  if (input.business_description) body.BusinessDescription = input.business_description;
  if (input.short_reasoning) body.ShortReasoning = input.short_reasoning;
  if (input.confidence_reason) body.ConfidenceReason = input.confidence_reason;
  if (input.evidence_urls) body.EvidenceUrls = input.evidence_urls;

  // UPSERT: enforce one-classification-per-account at the application layer.
  // (Method's Link field type doesn't expose Required/Unique flags, so we
  // can't rely on a DB constraint to dedupe.)
  const filter = `AccountRecordID eq ${input.account_record_id}`;
  const params = new URLSearchParams({
    select: 'RecordID',
    filter,
    top: '1',
  });
  const lookupRes = await methodApi(`/${DEST_TABLE}?${params.toString()}`);
  const lookup = (await lookupRes.json()) as { count: number; value: Array<{ RecordID: number }> };

  if (lookup.value.length > 0) {
    // Existing row — PATCH it in place.
    const existingId = lookup.value[0].RecordID;
    await methodApi(`/${DEST_TABLE}/${existingId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return {
      success: true,
      action: 'updated',
      record_id: existingId,
      source_account_record_id: input.account_record_id,
    };
  }

  // No existing row — POST new.
  const res = await methodApi(`/${DEST_TABLE}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const newId = Number.parseInt(text.trim(), 10);
  if (Number.isNaN(newId)) {
    throw new Error(`Unexpected POST response (not a numeric RecordID): ${text}`);
  }
  return {
    success: true,
    action: 'created',
    record_id: newId,
    source_account_record_id: input.account_record_id,
  };
}
