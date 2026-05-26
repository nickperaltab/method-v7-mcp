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
  CompanyAccount?: string;         // Tenant identifier — see V7-Pipeline-Spec §14.2
  CustomerEmail: string;
  CustDatIndustry?: string;
  Vertical?: string | null;
  Sector?: string;
  CustDatCountOfEmployees?: number;
  CustDatAnnualSales?: number;
  DeveloperCompanyName?: string | null;  // If set to a non-Method partner, account is partner-managed — see §14.3
  IsActive?: boolean;
}

// Substring patterns that identify Method-internal accounts via the friendly name.
// "test" is intentionally NOT in this list — a customer trial named "Test Kitchen LLC"
// is a real account. Method-curated test accounts are caught by IsTestAccount=true.
const INTERNAL_NAME_PATTERNS = [
  'template', 'qbo', 'restore', 'paid', 'demo',
  'alocet', 'methodappstore',
];

function isInternalAccount(name: string): boolean {
  const lc = (name ?? '').toLowerCase();
  if (lc.startsWith('m11') || lc.startsWith('m18')) return true;
  return INTERNAL_NAME_PATTERNS.some((p) => lc.includes(p));
}

// Shared field list used by both account-fetching tools so callers see a
// consistent shape. Adding a field here surfaces it in every tool output.
const ACCOUNT_SELECT_FIELDS = [
  'RecordID',
  'AccountFriendlyName',
  'CompanyAccount',
  'CustomerEmail',
  'CustDatIndustry',
  'Vertical',
  'Sector',
  'CustDatCountOfEmployees',
  'CustDatAnnualSales',
  'DeveloperCompanyName',
  'IsActive',
];

// Method API caps page size at 100. Paginate via skip to pull all classified IDs.
async function fetchAllClassifiedAccountIds(): Promise<Set<number>> {
  const ids = new Set<number>();
  const pageSize = 100;
  let skip = 0;
  while (true) {
    const params = new URLSearchParams({
      select: 'AccountRecordID',
      top: String(pageSize),
      skip: String(skip),
      orderby: 'RecordID asc',
    });
    const res = await methodApi(`/${DEST_TABLE}?${params.toString()}`);
    const data = (await res.json()) as { value: Array<{ AccountRecordID?: number | null }> };
    for (const r of data.value) {
      if (typeof r.AccountRecordID === 'number') ids.add(r.AccountRecordID);
    }
    if (data.value.length < pageSize) break;
    skip += pageSize;
  }
  return ids;
}

export async function getAccountsNeedingClassification(
  limit = 200,
  excludeAlreadyClassified = true,
): Promise<MethodAccount[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 500);
  // Fetch a wider net so we have room to filter internals + already-classified client-side.
  const fetchLimit = Math.min(cappedLimit * 4, 500);

  const filter = 'IsActive eq true and IsTestAccount eq false and IsMethoderAccount eq false';
  const select = ACCOUNT_SELECT_FIELDS.join(',');

  const params = new URLSearchParams({
    select,
    filter,
    top: String(fetchLimit),
    orderby: 'RecordID desc',
  });

  const res = await methodApi(`/CustomerMethodAccount?${params.toString()}`);
  const data = (await res.json()) as { count: number; value: MethodAccount[] };

  // Client-side filter against Method-internal/template name patterns
  let candidates = data.value.filter((a) => !isInternalAccount(a.AccountFriendlyName));

  if (excludeAlreadyClassified) {
    const classified = await fetchAllClassifiedAccountIds();
    candidates = candidates.filter((a) => !classified.has(a.RecordID));
  }

  return candidates.slice(0, cappedLimit);
}

// ── Review tools ─────────────────────────────────────────────────────────
// Three read/light-write tools that let an operator browse classifications
// from a Claude.ai conversation, drill into specifics, and toggle the
// NeedsReview flag once a row has been spot-checked.

export interface ClassificationRow {
  RecordID: number;
  AccountRecordID: number;
  L1: string;
  L2: string;
  L3: string;
  Confidence?: number;
  Version?: string;
  ClassifiedAt?: string;
  NeedsReview?: boolean;
  ContentSource?: string;
  BusinessDescription?: string;
  ShortReasoning?: string;
  ConfidenceReason?: string;
  EvidenceUrls?: string;
  OperatingModel?: string;
}

const CLASSIFICATION_SELECT_FIELDS = [
  'RecordID',
  'AccountRecordID',
  'L1',
  'L2',
  'L3',
  'Confidence',
  'Version',
  'ClassifiedAt',
  'NeedsReview',
  'ContentSource',
  'BusinessDescription',
  'ShortReasoning',
  'ConfidenceReason',
  'EvidenceUrls',
  'OperatingModel',
];

export interface GetRecentClassificationsInput {
  limit?: number;
  since_date?: string;          // ISO 8601, e.g. "2026-05-25" or "2026-05-25T00:00:00Z"
  needs_review_only?: boolean;
  min_confidence?: number;      // 0.0–1.0
  max_confidence?: number;      // 0.0–1.0
  operating_model?: OperatingModel;
  l1?: string;
}

export async function getRecentClassifications(
  input: GetRecentClassificationsInput,
): Promise<ClassificationRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const filters: string[] = [];
  if (input.since_date) {
    const norm = /^\d{4}-\d{2}-\d{2}$/.test(input.since_date)
      ? `${input.since_date}T00:00:00Z`
      : input.since_date;
    filters.push(`ClassifiedAt ge ${norm}`);
  }
  if (input.needs_review_only) filters.push('NeedsReview eq true');
  if (input.min_confidence !== undefined) filters.push(`Confidence ge ${input.min_confidence}`);
  if (input.max_confidence !== undefined) filters.push(`Confidence le ${input.max_confidence}`);
  if (input.operating_model) filters.push(`OperatingModel eq '${input.operating_model.replace(/'/g, "''")}'`);
  if (input.l1) filters.push(`L1 eq '${input.l1.replace(/'/g, "''")}'`);

  const params = new URLSearchParams({
    select: CLASSIFICATION_SELECT_FIELDS.join(','),
    top: String(limit),
    orderby: 'ClassifiedAt desc',
  });
  if (filters.length > 0) params.set('filter', filters.join(' and '));

  const res = await methodApi(`/${DEST_TABLE}?${params.toString()}`);
  const data = (await res.json()) as { value: ClassificationRow[] };
  return data.value;
}

// Drill into a specific account. Either by AccountRecordID (preferred, exact)
// or by account_friendly_name (substring match — useful when an operator only
// remembers the company name).
export interface GetClassificationForAccountInput {
  account_record_id?: number;
  account_friendly_name?: string;     // substring (case-insensitive)
}

export async function getClassificationForAccount(
  input: GetClassificationForAccountInput,
): Promise<{ classification: ClassificationRow | null; account: MethodAccount | null }> {
  let resolvedAccountId = input.account_record_id;

  // If only friendly name passed, resolve it first.
  // Note: Method's OData doesn't support tolower() — match is case-sensitive.
  if (!resolvedAccountId && input.account_friendly_name) {
    const safe = input.account_friendly_name.replace(/'/g, "''");
    const params = new URLSearchParams({
      select: 'RecordID,AccountFriendlyName',
      filter: `contains(AccountFriendlyName, '${safe}')`,
      top: '1',
    });
    const lookup = await methodApi(`/CustomerMethodAccount?${params.toString()}`);
    const data = (await lookup.json()) as { value: Array<{ RecordID: number }> };
    if (data.value.length === 0) return { classification: null, account: null };
    resolvedAccountId = data.value[0].RecordID;
  }

  if (!resolvedAccountId) {
    throw new Error('Either account_record_id or account_friendly_name must be provided');
  }

  // Fetch the account context
  const [accountResult] = await getAccountsByIds([resolvedAccountId]);

  // Fetch the classification (if any)
  const classParams = new URLSearchParams({
    select: CLASSIFICATION_SELECT_FIELDS.join(','),
    filter: `AccountRecordID eq ${resolvedAccountId}`,
    top: '1',
  });
  const classRes = await methodApi(`/${DEST_TABLE}?${classParams.toString()}`);
  const classData = (await classRes.json()) as { value: ClassificationRow[] };

  return {
    classification: classData.value[0] ?? null,
    account: accountResult ?? null,
  };
}

// Toggle NeedsReview on an existing classification row. Identified by
// AccountRecordID (the natural key from the operator's perspective).
export interface MarkClassificationReviewedInput {
  account_record_id: number;
  needs_review: boolean;        // true to flag, false to confirm-reviewed
}

export async function markClassificationReviewed(
  input: MarkClassificationReviewedInput,
): Promise<{ success: true; classification_record_id: number; needs_review: boolean }> {
  // Lookup the classification row
  const lookupParams = new URLSearchParams({
    select: 'RecordID',
    filter: `AccountRecordID eq ${input.account_record_id}`,
    top: '1',
  });
  const lookupRes = await methodApi(`/${DEST_TABLE}?${lookupParams.toString()}`);
  const lookup = (await lookupRes.json()) as { value: Array<{ RecordID: number }> };
  if (lookup.value.length === 0) {
    throw new Error(`No classification found for AccountRecordID ${input.account_record_id}`);
  }
  const rid = lookup.value[0].RecordID;

  await methodApi(`/${DEST_TABLE}/${rid}`, {
    method: 'PATCH',
    body: JSON.stringify({ NeedsReview: input.needs_review }),
  });

  return {
    success: true,
    classification_record_id: rid,
    needs_review: input.needs_review,
  };
}

// Targeted lookup: fetch full data for a specific list of RecordIDs.
// Does NOT apply the internal-account or active-paying filter — caller asked
// for these specific IDs and gets exactly those rows back. Used for drift
// studies, targeted re-runs, and review-loop reclassification.
//
// Method API caps top=100 per page; batches >100 are split into multiple
// round trips and concatenated.
export async function getAccountsByIds(ids: number[]): Promise<MethodAccount[]> {
  if (ids.length === 0) return [];
  const PAGE = 100;
  const out: MethodAccount[] = [];
  for (let i = 0; i < ids.length; i += PAGE) {
    const batch = ids.slice(i, i + PAGE);
    const filter = batch.map((id) => `RecordID eq ${id}`).join(' or ');
    const params = new URLSearchParams({
      select: ACCOUNT_SELECT_FIELDS.join(','),
      filter,
      top: String(batch.length),
    });
    const res = await methodApi(`/CustomerMethodAccount?${params.toString()}`);
    const data = (await res.json()) as { value: MethodAccount[] };
    out.push(...data.value);
  }
  return out;
}

// OperatingModel — orthogonal classification dimension. See V7-Pipeline-Spec §15.
export const OPERATING_MODELS = [
  'B2B_Producer',
  'B2B_Distributor',
  'DTC_Producer',
  'Hybrid_Producer',
  'Pure_Retailer',
  'Service_Only',
  'Service_With_Products',
  'Project_Services',
  'Hospitality',
] as const;
export type OperatingModel = typeof OPERATING_MODELS[number];

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
  operating_model?: OperatingModel;
}

export interface WriteV7Result {
  success: true;
  action: 'created' | 'updated';
  record_id: number;               // RecordID of the row in CustomerIndustryClassification
  source_account_record_id: number;
}

// Hardcoded destination — never parameterize this.
const DEST_TABLE = 'CustomerIndustryClassification';

// Normalize the caller-supplied timestamp.
// - Missing → server time (now)
// - Date-only "YYYY-MM-DD" → server time (avoids the midnight bug)
// - Anything that parses as a valid Date → its ISO 8601 form
// - Anything else (garbage) → server time
function normalizeClassifiedAt(input?: string): string {
  if (!input) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date().toISOString();
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

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
  body.ClassifiedAt = normalizeClassifiedAt(input.classified_at);
  if (input.needs_review !== undefined) body.NeedsReview = input.needs_review;
  if (input.content_source) body.ContentSource = input.content_source;
  if (input.business_description) body.BusinessDescription = input.business_description;
  if (input.short_reasoning) body.ShortReasoning = input.short_reasoning;
  if (input.confidence_reason) body.ConfidenceReason = input.confidence_reason;
  if (input.evidence_urls) body.EvidenceUrls = input.evidence_urls;
  if (input.operating_model) body.OperatingModel = input.operating_model;

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
