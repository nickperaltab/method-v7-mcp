// Thin wrapper around fetch() for Method API.
// Holds the API key, sets headers, throws on error.

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

export interface WriteV7Result {
  success: true;
  new_record_id: number;
  source_account_record_id: number;
}

// Hardcoded destination — never parameterize this.
const DEST_TABLE = 'CustomerIndustryClassification';

export async function writeV7Classification(input: {
  account_record_id: number;
  l1: string;
  l2: string;
  l3: string;
}): Promise<WriteV7Result> {
  // Test table schema: L1, L2, L3 (with L3 storing AccountRecordID as text for now).
  // Production schema will add AccountRecordID + Confidence + Version + etc.
  const body = {
    L1: input.l1,
    L2: input.l2,
    L3: input.l3,
  };
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
    new_record_id: newId,
    source_account_record_id: input.account_record_id,
  };
}
