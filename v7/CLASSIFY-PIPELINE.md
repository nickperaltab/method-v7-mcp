# V7 Classification — Routine Adaptation

This is the routine-adapted version of `.claude/commands/classify.md` (the local Claude Code slash command). It tells a cloud-routine session how to run the same enrichment + classification flow against accounts pulled from the Method MCP, then write results back through the MCP.

**Source of truth (local, full version):** `Rev Ops System/.claude/commands/classify.md` — keep the two in sync.

---

## What you're doing

For each Method account passed in:

1. **Pull signals** from the MCP read tool (Alocet self-reported fields) + a 5-source enrichment waterfall (web)
2. **Classify** in one reasoning pass against the V7 taxonomy + 4 core principles
3. **Compute final confidence** from a weighted formula (see §1f)
4. **Write the result** via the MCP write tool

You should always state your reasoning out loud in the transcript — it's the audit trail.

---

## Step 0 — Setup

### 0a. Load the V7 taxonomy
Read `v7/taxonomy/TAXONOMY_V7.csv` from the cloned repo. Parse into:
- A taxonomy tree (L1 > L2 > L3) with descriptions and `disambiguation_notes`
- A valid combos set (every (L1, L2, L3) tuple)
- An L3 lookup dict (L3 name → (L1, L2, L3))

### 0b. Load the rules
Read `v7/rules/industry-classification-rules.md` for the 4 core principles + L1/L2/L3 listing. Read `v7/rules/classification-methodology.md` for the operating-model framework, B2B/B2C × Make/Resell matrix, and rule history.

The 4 principles are:
1. **Identity over Activity** — classify by what the business IS, not how it operates
2. **Storefront Test** — B2B reseller → MWD > Distribution; B2C primary channel → R&C
3. **Require Positive Evidence** — never infer from absence; vague language → flag, don't default
4. **No Catch-All Defaults** — never use a "General"/"Other"/Strategy & Consulting bucket as a fallback

Category-specific routing lives in the taxonomy CSV's `disambiguation_notes` column. **Read those notes for the L3 you're considering.**

### 0c. Pull candidate accounts
Call the MCP tool `get_accounts_needing_v7_classification(limit=N)` for the batch size you want.

The MCP returns: `RecordID, AccountFriendlyName, CustomerEmail, CustDatIndustry, Vertical, Sector, CustDatCountOfEmployees, CustDatAnnualSales`.

---

## Step 1 — Process each account

### 1a. Method-internal signals (priors) — ALWAYS read first
Before any external enrichment, read what Method already knows about the account. Treat these as PRIORS that inform reasoning throughout, NOT just fallback.

| Field | What it tells us |
|---|---|
| `Vertical` (self-selected) | Customer's own industry pick. If set and meaningful (not null, not "Other"), this is a strong signal. |
| `CustDatIndustry` | Often blank, but when set adds a second self-classification. |
| `Sector` | Same family as CustDatIndustry. |
| `CustDatCountOfEmployees` | **Scale signal.** 1 employee + Etsy presence → Artisan. 500 employees → Industrial Mfg. |
| `CustDatAnnualSales` | Scale signal. Differentiates small operator from established business. |
| `AccountFriendlyName` | Identifier + sometimes contains industry clues. |
| `CustomerEmail` | Domain → potential website. Personal name → may indicate solo operator. |

**How to use them:**
- If `Vertical` is meaningfully set (not null/Other/General), bias toward that L1 and use enrichment to refine L2/L3.
- Note employee count and revenue range — these constrain plausible classifications (e.g., a 500-employee "marketing agency" is probably a real PBS firm, not a freelancer).
- Use email domain to decide enrichment path (see 1c).

### 1a-bis. Alternate contacts lookup (NEW — recover real customer domain)

When the primary `CustomerEmail` is one of:
- Freemail (`gmail.com`, `yahoo.com`, `hotmail.com`, `outlook.com`, `aol.com`, `icloud.com`, `me.com`, `live.com`, `protonmail.com`, `mailinator.com`)
- Partner-managed (`DeveloperCompanyName` set to a non-Method partner)
- Method-internal (`method.me`, `methodintegration.com`)

…query the `Contacts` table for alternate emails:

```python
qs = urllib.parse.urlencode({
    'select': 'RecordID,Email,CompanyName,FirstName,LastName',
    'filter': f'Entity_RecordID eq {account_record_id}',
    'top': '20',
}, quote_via=urllib.parse.quote)
contacts = method_get(f'/Contacts?{qs}')
```

For each contact's email, extract the domain. **Keep the first domain that is NOT in:** freemail list, method.me, methodintegration.com, OR the primary account's email domain.

If a customer-looking domain is found → use it as the source for the WebFetch waterfall (Path A). Mark `content_source = 'contact_lookup'` if this becomes the primary classification signal.

If no usable alternate contact → fall through to Path B (freemail/partner) waterfall as before.

### 1b. Extract email domain & choose enrichment path
Parse `CustomerEmail`. Determine `email_domain`. If the domain is a freemail provider (`gmail.com`, `yahoo.com`, `hotmail.com`, `outlook.com`, `aol.com`, `icloud.com`, `protonmail.com`, `zoho.com`, plus regional variants like `.co.uk`, `.ca`), classify the account as **freemail** and use Path B in 1c.

### 1c. Name-based overrides
If `AccountFriendlyName` contains (case-insensitive): `home watch`, `homewatch`, `property watch`, `house watch`:
- Classification: `Field Services & Trades` > `Home Watch` > `Home Watch Services`
- Confidence: 0.90, content_source: `name_override`
- Skip the rest of Step 1, write and continue

### 1d. Enrichment waterfall (two paths based on email)

**Run sources in order until you have useful business content (≥100 chars of substantive text). Use the FIRST source that yields a clear signal. Clay is a FALLBACK after the web sources — only call it if the web waterfall didn't produce enough signal to classify confidently (e.g., still uncertain at the L2 level after 3 web sources).**

#### Path A — Real email domain (NOT freemail)

| # | Source | content_source label | How |
|---|---|---|---|
| 1 | WebFetch the email domain | `web_fetch` | **PRIMARY.** Fetch `https://{email_domain}`. Treat parked/dead domains ("for sale", "coming soon", "under construction") as no content. Customer's own website is the highest-fidelity source. |
| 2 | WebSearch BBB | `bbb_search` | Search `"{company name} BBB"`. If a BBB result, WebFetch the BBB page. |
| 3 | WebSearch company + city | `search_verified` / `search_snippet` | Search `"{company name}"` (+city/state if known). If results include a real business website, WebFetch it. LinkedIn/Yelp/Google Maps listings are valid signals. |
| 4 | WebSearch the email domain | `domain_search` | Catches cached descriptions, press mentions when the site itself is dead. |
| 5 | **Clay enrichment** | `clay` | **Fallback only when web sources didn't yield enough signal.** Use Clay MCP to enrich the company by name + domain. Clay's best contributions: structured industry tag (LinkedIn-derived), scale signals (employees, revenue), tech stack. |
| 6 | Name + self-selected only | `name_only` | Last resort. Parse name for clues + Vertical fallback table. |

#### Path B — Freemail email domain (gmail/yahoo/etc.)

| # | Source | content_source label | How |
|---|---|---|---|
| 1 | WebSearch BBB | `bbb_search` | Search `"{company name} BBB"`. If a BBB result, WebFetch the BBB page. |
| 2 | WebSearch company + city | `search_verified` / `search_snippet` | Search `"{company name}"` (+city/state if known). If results include a real business website, WebFetch it. |
| 3 | **Clay enrichment** | `clay` | **Fallback only when web sources didn't yield enough signal.** Try Clay by name. Often returns nothing for personal-name accounts. |
| 4 | Name + self-selected only | `name_only` | Last resort. Parse name for clues + Vertical fallback table. |

#### When to invoke Clay (the fallback rule)

After running the web sources for the relevant path, ask: **"Do I have enough signal to classify confidently (≥0.65 confidence at L2 level)?"**

- ✅ Yes → skip Clay, proceed to 1e. (Saves a Clay credit; web data is sufficient.)
- ❌ No → invoke Clay. Reason across web + Clay together for the final decision.

This adaptive use of Clay keeps the cost down while ensuring we have a safety net for accounts with weak web presence.

### 1e. Classify in a single reasoning pass
With the Method-internal priors (1a), enrichment data (1d), the taxonomy (incl. disambiguation_notes), and the 4 principles in your context:

1. **What does this business do?** Synthesize all signals into a business description (1–2 sentences).
2. **Apply Principle 1 (Identity).** What would the owner say at a cocktail party? Use the Classification Matrix:
   | | Makes the product | Resells the product |
   |---|---|---|
   | **B2B** | MWD > Manufacturing | MWD > Distribution |
   | **B2C (storefront primary)** | MWD > Manufacturing (tag `b2c_channel`) | Retail & Consumer |
3. **Pick L2** within the chosen L1.
4. **Pick L3.** Read the `disambiguation_notes` for your candidate L3 — it contains category-specific routing guidance (e.g., "Engraving services → Services & Trades, not Artisan Manufacturing").
5. **Verify against all 4 principles:**
   - P1: Did you classify by identity, not activity?
   - P2: If reseller with mixed channels, did you apply the storefront test?
   - P3: Is there positive evidence? (Distribution needs reselling evidence; Manufacturing needs production evidence.)
   - P4: Did you avoid catch-all defaults? If you picked General/Other/Strategy & Consulting, reconsider — only use them with explicit evidence.
6. **Set `ai_confidence` honestly** using the scale below.
7. **UNCLASSIFIABLE check:** if `ai_confidence < 0.50` AND no usable data, set L1/L2/L3 = `UNCLASSIFIABLE`.

**Confidence by source:**

| Source | Range |
|---|---|
| `web_fetch` + clear match | 0.80–0.95 |
| `pre_enriched` + clear match | 0.75–0.92 |
| `search_verified` + clear match | 0.70–0.85 |
| `bbb_search` + clear match | 0.70–0.85 |
| `clay_only` + clear match | 0.50–0.70 |
| `search_snippet` + reasonable match | 0.50–0.70 |
| `name_only` + clear name | 0.60–0.75 |
| `name_only` + ambiguous name | 0.15–0.40 |

**Self-selected fallback** — only if `ai_confidence ≤ 0.30`:

| Self-Selected | Maps to |
|---|---|
| Construction | S&T > General Contracting > General Contracting |
| Manufacturing (MWD) | MWD > Industrial Manufacturing > Industrial Equipment Mfg |
| Field Services | S&T > Industrial & Commercial Field Services > Other Commercial Field Services |
| Accounting and Bookkeeping | PBS > Accounting & Bookkeeping > Bookkeeping & Payroll Services |
| IT and computer related | PBS > IT Services & Technology > IT Consulting & Implementation |
| Non-profit, govt or religious | PBS > Non-profit & Government > Non-profit & Charitable Organizations |
| Repair and maintenance | S&T > Home & Property Services > Residential Repair & Maintenance |
| Automotive parts, repair and maintenance | R&C > Automotive Services & Retail > Automotive Services & Retail |
| Home Watch | S&T > Home Watch > Home Watch Services |

Skip mapping for vague self-selected values: `Consulting and Professional Services`, `General service based`, `General product based`, `Other`, `General`, `Unknown`.

### 1f. Validate the (L1, L2, L3) tuple
Confirm the tuple exists in the valid combos set you parsed in 0a. If L3 is valid but L1/L2 are wrong, fix using the L3 lookup dict.

### 1f-bis. Pick the OperatingModel — second dimension, orthogonal to L1

V7 L1/L2/L3 captures **industry identity** (what they are). OperatingModel captures **how they go to market** (B2B-only vs DTC vs hybrid vs service vs hospitality). Both are required.

Pick exactly ONE value from this controlled vocabulary:

| Value | When to pick |
|---|---|
| `B2B_Producer` | Makes products for businesses, no consumer-facing store |
| `B2B_Distributor` | Resells to businesses, doesn't produce |
| `DTC_Producer` | Makes + sells direct to consumers via own site, with shippable/shelf-able product (storefront test passes; you're the manufacturer-brand) |
| `Hybrid_Producer` | Makes + sells through BOTH own DTC channel AND B2B/wholesale partners visibly |
| `Pure_Retailer` | Sells consumer goods, doesn't produce them (storefront test passes; no manufacturing) |
| `Service_Only` | Pure service business, no product revenue |
| `Service_With_Products` | Service business that ALSO sells non-trivial parts/equipment (HVAC + parts counter, repair shop + consignment sales) |
| `Project_Services` | Project-based delivery — defined start/end, deliverable-based (construction, A&E, agencies) |
| `Hospitality` | Service experience anchored on in-the-moment consumption — restaurants, bars, cafes, hotels, food trucks, event venues |

**Tiebreakers:**
- DTC vs Pure_Retailer hinges on production. Make it → DTC_Producer. Resell only → Pure_Retailer.
- DTC vs Hospitality hinges on delivery model. Shippable/shelf-able CPG → DTC_Producer. In-the-moment consumption + service experience → Hospitality.
- Service_Only vs Service_With_Products hinges on whether product revenue is non-trivial. Plumber selling occasional faucet → Service_Only. Plumber with a parts counter → Service_With_Products.
- Hybrid_Producer requires BOTH channels visibly active. Default to DTC_Producer if B2B is incidental.
- Project_Services overrides Service_Only when delivery is project-based with defined deliverables; ongoing/recurring service contracts → Service_Only.

If the L1 is `UNCLASSIFIABLE` or the website is too thin, pick the closest fit and let the low confidence + review flag carry the uncertainty. Do not invent values outside the 9 above.

### 1g. Compute final confidence
```
final_confidence = 0.60 * ai_confidence + 0.25 * source_weight + 0.15 * content_factor
```

| | Source | Weight |
|---|---|---|
| `pre_enriched` | 0.85 | |
| `clay_only` | 0.45 | |
| `web_fetch` | 1.0 | |
| `bbb_search` | 0.85 | |
| `search_verified` | 0.6 | |
| `search_snippet` | 0.5 | |
| `domain_search` | 0.4 | |
| `name_only` | 0.15 | |
| `name_override` | 1.0 | |

| Content size | Factor |
|---|---|
| > 2000 chars | 1.0 |
| > 500 chars | 0.7 |
| > 100 chars | 0.4 |
| else | 0.15 |

**Hard cap:** `name_only` sources max at `final_confidence = 0.70`.

### 1h. Set the review flag
`needs_review = true` when ANY of:
- `final_confidence < 0.55`
- No `Vertical` AND `final_confidence < 0.60`
- Classification is `UNCLASSIFIABLE`

### 1i. Write the result
Call MCP tool `write_v7_classification` with ALL 13 fields populated where you have them:
- `account_record_id` — source account's RecordID (integer, required)
- `l1`, `l2`, `l3` — V7 labels (strings, required)
- `confidence` — `final_confidence` (0.0–1.0)
- `version` — `"V7.1"`
- `classified_at` — ISO 8601 timestamp of this run
- `needs_review` — boolean
- `content_source` — which source drove the classification (`web_fetch`, `clay`, `bbb_search`, etc.)
- `business_description` — 1–2 sentence summary of what the business does
- `short_reasoning` — one sentence on why this L1/L2/L3. Plain reasoning, no prefix.
- `operating_model` — one of the 9 controlled values from §1f-bis (`B2B_Producer`, `B2B_Distributor`, `DTC_Producer`, `Hybrid_Producer`, `Pure_Retailer`, `Service_Only`, `Service_With_Products`, `Project_Services`, `Hospitality`). Required for all classifications.
- `confidence_reason` — one sentence explaining the confidence number
- `evidence_urls` — comma-separated URLs of sources used (Clay calls aren't URLs; for web sources include the actual URLs)

Verify the response contains `success: true` and `action: "created"` (or `"updated"` for an UPSERT). If error, log and continue.

---

## Step 2 — Post-run report

After processing the batch, output a summary in the transcript:

- **Coverage:** classified X / failed Y / unclassifiable Z
- **L1 distribution:** counts and percentages (flag if any L1 > 35% — you classified a biased batch)
- **Confidence distribution:** High (>0.85) / Medium (0.65–0.85) / Low (0.40–0.64) / Very Low (<0.40)
- **Review queue size:** how many `needs_review = true`
- **Errors encountered:** full text of any MCP errors

---

## Critical reminders

- **State your reasoning out loud** in the transcript for every account — this is the audit trail.
- **Read the disambiguation_notes** in the taxonomy CSV before finalizing L3.
- **Never skip the enrichment waterfall** — Vertical/CustDatIndustry alone is rarely enough.
- **Never default to a catch-all** when evidence is thin — UNCLASSIFIABLE is the right answer.
- **Only call the MCP tools** for read/write. Don't try to hit the Method API directly.
