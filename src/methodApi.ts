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
  CustDatCountOfCustomers?: number;     // B2B vs B2C disambiguator — see CLASSIFY-PIPELINE.md §1a
  IndustryCode?: string;                // QB-reported NAICS code ('999999' = unclassified sentinel)
  QBOIndustryType?: string;             // QB's structured industry label (more reliable than CustDatIndustry)
  SignupCountry?: string;               // Enables country-aware enrichment routing
  DeveloperCompanyName?: string | null; // If set to a non-Method partner, account is partner-managed — see §14.3
  IsActive?: boolean;
}

// Substring patterns that identify Method-internal accounts via the friendly name.
// "test" is intentionally NOT in this list — a customer trial named "Test Kitchen LLC"
// is a real account. Method-curated test accounts are caught by IsTestAccount=true.
//
// Patterns added 2026-06-02 after trial-batch surfaced new internal naming:
//   - methodtest/methodtesting/methodint/methodyuri — Method internal test families
//   - appdirect — AppDirect partnership test accounts
//   - qaco/qadev/qatenant — generic QA-named accounts
// Patterns added 2026-06-02 (round 2) after contacts-recovery surfaced 125 more leakers:
//   - tenant — day2tenant, dma1tenant, greatnewtenant, etc.
//   - dma — Data Miner Activity test family (dma1tenant, dmaff1, dmasync1)
//   - fabrikam — classic Microsoft test company name used in Method demos
//   - sugarshack — "Hamilton Sugar Shack" demo family
//   - errolsorry / erroltest — Method employee accidental test accounts
//   - dbtest / ethostest — explicit-named test accounts
// Pattern added 2026-06-02 (round 3) after May-paying-gap batch surfaced "BioPhotas Sandbox":
//   - sandbox — staging/test instances of real customer accounts
// Patterns added 2026-06-09 after GRR backfill (rounds 1-3, 1800 RIDs) surfaced recurring CRM-artifact leakers:
//   - '-old' / '_old' — suffix patterns for superseded accounts (e.g., "Empty Nest Home Services - Old", "service-old")
//     Substring match: keeps real "Old World Bakery" / "Holdco" type names safe (they don't contain "-old" or "_old")
//   - 'bptest' — explicit test artifact pattern (chunk 14: "BIG PIPE LLC" with CompanyAccount "bptest")
const INTERNAL_NAME_PATTERNS = [
  'template', 'qbo', 'restore', 'paid', 'demo',
  'alocet', 'methodappstore',
  'methodtest', 'methodint', 'methodyuri',
  'appdirect', 'qaco', 'qadev', 'qatenant',
  'tenant', 'dma', 'fabrikam', 'sugarshack',
  'errolsorry', 'erroltest', 'dbtest', 'ethostest',
  'sandbox',
  '-old', '_old', 'bptest',
];

function isInternalAccount(name: string): boolean {
  const lc = (name ?? '').toLowerCase();
  if (lc.startsWith('m11') || lc.startsWith('m18')) return true;
  return INTERNAL_NAME_PATTERNS.some((p) => lc.includes(p));
}

// Email-domain exclusion — complements the name patterns above. Added
// 2026-06-12 after two consecutive routine runs pulled Method-internal
// onboarding/QA accounts whose NAMES looked legit but whose primary emails
// were @method.me / mailinator (e.g., "Maria Perdomo" = ayushi.patel@method.me
// onboarding test, "Ami" = j.murray+qa1@method.me). Method's own
// IsTestAccount/IsMethoderAccount flags were not set on these.
const INTERNAL_EMAIL_DOMAINS = new Set<string>([
  'method.me',
  'methodintegration.com',
  'mailinator.com',
]);

function isInternalEmail(email: string | undefined | null): boolean {
  const e = (email ?? '').toLowerCase().trim();
  const at = e.lastIndexOf('@');
  if (at < 0) return false;
  return INTERNAL_EMAIL_DOMAINS.has(e.slice(at + 1));
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
  'CustDatCountOfCustomers',
  'IndustryCode',
  'QBOIndustryType',
  'SignupCountry',
  'DeveloperCompanyName',
  'IsActive',
];

// Re-classification cutoffs. "Skip" = this account is already done well enough; don't pull again.
// Re-classify if: label is weak AND old enough that the prompt has had a chance to improve.
const RECLASSIFY_MIN_CONFIDENCE = 0.65;          // labels below this are weak
const RECLASSIFY_SETTLE_DAYS = 7;                // don't re-touch labels younger than this

// Returns the SKIP-LIST: RIDs whose current classification is "good enough" or "too fresh
// to re-touch yet." Everything NOT in this set is eligible for the work queue, which means
// either (a) never classified, or (b) classified with a weak label more than 7 days ago.
// This makes the routine self-healing: as the prompt + enrichment improve, weak old labels
// automatically cycle back through for re-classification with no separate cron.
async function fetchClassificationSkipList(): Promise<Set<number>> {
  const ids = new Set<number>();
  const pageSize = 100;
  let skip = 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECLASSIFY_SETTLE_DAYS);

  while (true) {
    const params = new URLSearchParams({
      select: 'AccountRecordID,Confidence,L1,ClassifiedAt',
      top: String(pageSize),
      skip: String(skip),
      orderby: 'RecordID asc',
    });
    const res = await methodApi(`/${DEST_TABLE}?${params.toString()}`);
    const data = (await res.json()) as {
      value: Array<{
        AccountRecordID?: number | null;
        Confidence?: number | null;
        L1?: string | null;
        ClassifiedAt?: string | null;
      }>;
    };
    for (const r of data.value) {
      if (typeof r.AccountRecordID !== 'number') continue;
      const conf = r.Confidence ?? 0;
      const l1 = (r.L1 ?? '').trim();
      const classifiedAt = r.ClassifiedAt ? new Date(r.ClassifiedAt) : null;

      const isStrongLabel = conf >= RECLASSIFY_MIN_CONFIDENCE && l1 !== '' && l1 !== 'UNCLASSIFIABLE';
      // If we can't parse ClassifiedAt, treat as recent (don't re-touch); safer than re-classifying
      // every label on every run.
      const isRecent = !classifiedAt || classifiedAt > cutoff;

      if (isStrongLabel || isRecent) ids.add(r.AccountRecordID);
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
  // Method's OData caps page size at 100. The prior implementation set top=500
  // and never paginated, so it could only ever see the newest 100 accounts —
  // once those were all classified, the routine returned 0 and the backlog of
  // older unclassified accounts became permanently invisible. Fix: real pagination.
  const PAGE = 100;
  // Hard cap on scan depth so a fully-classified base doesn't loop forever
  // (100 pages × 100 rows = up to 10k candidates considered).
  const MAX_PAGES = 100;

  // Pre-fetch the skip-list once: RIDs whose current label is strong OR too fresh to re-touch.
  // Everything not in this set is eligible — covers both never-classified accounts AND
  // accounts whose label is weak (UNCLASSIFIABLE or conf<0.65) and older than the settle period.
  const classified = excludeAlreadyClassified
    ? await fetchClassificationSkipList()
    : new Set<number>();

  const filter = 'IsActive eq true and IsTestAccount eq false and IsMethoderAccount eq false';
  const select = ACCOUNT_SELECT_FIELDS.join(',');

  const out: MethodAccount[] = [];
  let skip = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      select,
      filter,
      top: String(PAGE),
      skip: String(skip),
      orderby: 'RecordID desc',
    });
    const res = await methodApi(`/CustomerMethodAccount?${params.toString()}`);
    const data = (await res.json()) as { count: number; value: MethodAccount[] };
    const pageRows = data.value;

    for (const row of pageRows) {
      if (isInternalAccount(row.AccountFriendlyName)) continue;
      if (isInternalEmail(row.CustomerEmail)) continue;
      if (excludeAlreadyClassified && classified.has(row.RecordID)) continue;
      out.push(row);
      if (out.length >= cappedLimit) return out;
    }
    if (pageRows.length < PAGE) break; // exhausted the table
    skip += PAGE;
  }

  return out;
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

// Step 1a-bis support: pull contacts for an account so the classifier can
// recover the real customer domain when the primary CustomerEmail is freemail,
// partner-managed, or Method-internal. Pipeline rule lives in
// v7/CLASSIFY-PIPELINE.md §1a-bis — this tool just returns raw contacts;
// callers apply the "first non-freemail, non-Method, non-primary-domain" rule.
export interface Contact {
  RecordID: number;
  Email?: string;
  CompanyName?: string;
  FirstName?: string;
  LastName?: string;
}

export async function getContactsForAccount(accountRecordId: number): Promise<Contact[]> {
  const params = new URLSearchParams({
    select: 'RecordID,Email,CompanyName,FirstName,LastName',
    filter: `Entity_RecordID eq ${accountRecordId}`,
    top: '20',
  });
  const res = await methodApi(`/Contacts?${params.toString()}`);
  const data = (await res.json()) as { value: Contact[] };
  return data.value;
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

// ── Taxonomy tuple validation ────────────────────────────────────────────
// Loaded once at boot from the bundled TAXONOMY_V7.csv. Rejects writes whose
// (L1, L2, L3) isn't an exact taxonomy row — catches abbreviation drift
// ("Industrial Equipment Mfg"), stale V6 names ("Services & Trades"), and
// hallucinated categories. Audit 2026-06-10 found 121 such rows already in
// production before this check existed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Minimal RFC-4180 CSV field splitter — quote-aware, because L2 values like
// "HVAC, Plumbing & Electrical" contain commas inside quoted fields. A naive
// split(',') would chop those and silently reject legitimate writes.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function loadValidTuples(): Set<string> {
  const tuples = new Set<string>(['UNCLASSIFIABLE|UNCLASSIFIABLE|UNCLASSIFIABLE']);
  try {
    const csvPath = join(process.cwd(), 'v7', 'taxonomy', 'TAXONOMY_V7.csv');
    const text = readFileSync(csvPath, 'utf-8');
    const lines = text.split('\n').slice(1); // header skipped; no L1/L2/L3 cell contains a newline
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = splitCsvLine(line);
      if (parts.length < 3) continue;
      const [l1, l2, l3] = [parts[0].trim(), parts[1].trim(), parts[2].trim()];
      if (l1 && l2 && l3) tuples.add(`${l1}|${l2}|${l3}`);
    }
  } catch (e) {
    // Fail open with a console warning rather than blocking all writes if the
    // CSV isn't found in the deploy bundle. The harness + routine prompt still
    // enforce tuples; this is defense-in-depth, not the only gate.
    console.error('[taxonomy] could not load TAXONOMY_V7.csv for tuple validation:', e);
    return new Set<string>(); // empty set = validation disabled
  }
  return tuples;
}

const VALID_TUPLES = loadValidTuples();

function checkTupleValidity(input: V7ClassificationInput): string | null {
  if (VALID_TUPLES.size === 0) return null; // CSV unavailable — fail open
  const key = `${input.l1.trim()}|${input.l2.trim()}|${input.l3.trim()}`;
  if (VALID_TUPLES.has(key)) return null;
  return (
    `Invalid taxonomy tuple: (${input.l1} | ${input.l2} | ${input.l3}) is not an exact ` +
    `row in TAXONOMY_V7.csv. Copy the L1/L2/L3 strings exactly from the taxonomy — ` +
    `no abbreviations (write "Manufacturing", not "Mfg"). For unclassifiable accounts ` +
    `use l1=l2=l3=UNCLASSIFIABLE.`
  );
}

// P4 enforcement: L3 values that are forbidden as catch-all fallbacks.
// Per V7-Pipeline-Spec Principle 4 + CLASSIFY-PIPELINE.md §1e top-of-section rule.
// Added 2026-06-05 after audit found 190 mis-labeled accounts using these as defaults
// when the AI should have written UNCLASSIFIABLE.
const FORBIDDEN_CATCHALL_L3 = new Set<string>([
  'Strategy & Management Consulting',
  'General Wholesale & Distribution',
]);

// Block writes of forbidden L3s when evidence is weak.
// Returns null if allowed; returns error message if blocked.
function checkCatchallRejection(input: V7ClassificationInput): string | null {
  if (!FORBIDDEN_CATCHALL_L3.has(input.l3)) return null;
  const conf = input.confidence ?? 0;
  const source = (input.content_source ?? '').toLowerCase();
  const hasWeakSource = source === 'name_only' || source === '';
  const hasWeakConfidence = conf < 0.65;
  if (hasWeakSource || hasWeakConfidence) {
    return (
      `Refusing to write forbidden catch-all L3 "${input.l3}" with weak evidence ` +
      `(content_source="${source || 'unset'}", confidence=${conf}). ` +
      `Per CLASSIFY-PIPELINE.md §1e P4 rule: write l1=l2=l3=UNCLASSIFIABLE instead. ` +
      `If this account genuinely IS ${input.l3.toLowerCase()}, re-classify with ` +
      `web_fetch / search_verified / bbb_search evidence and confidence >= 0.65.`
    );
  }
  return null;
}

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
  // P4 enforcement: reject catch-all L3s with weak evidence before any API call.
  const tupleError = checkTupleValidity(input);
  if (tupleError) throw new Error(tupleError);
  const rejection = checkCatchallRejection(input);
  if (rejection) throw new Error(rejection);

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
