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
2. **Storefront Test** — B2B reseller → MWD > Distribution; B2C primary channel → R&C. **It routes to Retail ONLY for *consumer goods*.** An e-commerce site alone does NOT make an industrial/equipment/B2B-goods reseller a consumer retailer (shipping containers, commercial fitness equipment, building materials to contractors, industrial supplies) → those are **M&D Distribution** regardless of a public website (`Hybrid_Producer` if both B2C+B2B, `B2B_Distributor` if mostly business; equipment *rental* → M&D equipment distribution). Test by dominant customer: would a normal household routinely buy this product? No → Distribution.
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
| `Vertical` (self-selected) | Customer's own industry pick. Strong signal when set and meaningful — with two known traps: `"Accounting and Bookkeeping"` accounts are frequently QuickBooks implementation consultants (→ PBS > IT Services & Technology > IT Consulting & Implementation), not bookkeepers; `"Wholesale and distribution services"` often masks manufacturers. Web-verify both. |
| `CustDatIndustry` | Often blank, but when set adds a second self-classification. |
| `Sector` | Same family as CustDatIndustry. |
| `QBOIndustryType` | QuickBooks Online's structured industry label. **Reliable when specific** (e.g., "Plumbing/heating/AC contractors", "Religious organizations", "Coffee and tea manufacturing", "Marinas", "Janitorial services", "Offices of CPAs") — trust after a quick web confirm. **Noise when generic** ("Construction", "Manufacturing", "WholesaleDistributionandSales", "GeneralProductbasedBusiness", "OtherNone", "RetailSummary") — do the full web enrichment; generic values are frequently directionally wrong on make-vs-resell. |
| `IndustryCode` | **(NEW prior)** QB-reported NAICS code as string. `'999999'` is the "unclassified" sentinel — ignore. Other values (e.g., `'61'` = Educational Services) are direct NAICS codes — use to anchor L1/L2 pick. |
| `CustDatCountOfEmployees` | **Scale signal.** 1 employee + Etsy presence → Artisan. 500 employees → Industrial Mfg. |
| `CustDatAnnualSales` | Scale signal. Differentiates small operator from established business. |
| `CustDatCountOfCustomers` | **(NEW prior) Customer-base scale + B2B vs B2C disambiguator.** A QB business with 2 customers is almost certainly a B2B specialist (consultant, engineering firm, contractor with corporate accounts). 86+ customers suggests B2C retail, broad services, or hospitality. Use as a tiebreaker when storefront/website signals are ambiguous. |
| `SignupCountry` / `BillAddressCountry` | **(NEW prior)** Country signal. Use to route the enrichment waterfall: US/CA defaults to existing sources; non-US accounts should prefer country-specific business registries (UK Companies House, Aus ABN lookup, etc.) before US-centric WebSearch. |
| `AccountFriendlyName` | Identifier + sometimes contains industry clues. |
| `CustomerEmail` | Domain → potential website. Personal name → may indicate solo operator. |

**How to use them:**
- `QBOIndustryType` populated with a **specific** value → strong prior, lock L1/L2 after quick web confirm. Populated with a **generic** value → do the full web enrichment before trusting it.
- **No-website rescue (added 2026-06-18):** for freemail / no-fetchable-domain accounts that would otherwise go UNCLASSIFIABLE, a **specific** `QBOIndustryType` is often the only signal — and it's a good one (~90% of accounts have a connected QuickBooks). Classify from it directly (map the QB industry to V7), mark `content_source = 'qbo_industry'`, confidence 0.62–0.72. Do NOT default such accounts to UNCLASSIFIABLE when a specific QB industry exists. (`QBOIndustryType` is readable via the Method REST API on `CustomerMethodAccount` — no separate Alocet/VPN access needed.)
- If `IndustryCode != '999999'` and looks like a NAICS code, map to V7 L1/L2 directly (consult NAICS → V7 mapping table at end of §1a if available).
- If `Vertical` is meaningfully set (not null/Other/General), bias toward that L1 and use enrichment to refine L2/L3 — except the two traps noted above (Accounting/Bookkeeping → check for QB consultant; Wholesale/distribution → check for manufacturer).
- Use `CustDatCountOfCustomers` as a B2B-vs-B2C tiebreaker (low count = B2B specialist, high count = B2C or broad services).
- Note employee count and revenue range — these constrain plausible classifications (e.g., a 500-employee "marketing agency" is probably a real PBS firm, not a freelancer).
- Use email domain to decide enrichment path (see 1c).
- If `SignupCountry != 'United States' && != 'Canada'`, prefer country-specific sources in the §1d waterfall.

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

For each contact's email, extract the domain. **Keep the first domain that is NOT in:** freemail list, method.me, methodintegration.com, mailinator.com, OR the primary account's email domain.

**Test-account signal:** if the ONLY contacts found are at `mailinator.com`, `method.me`, or `methodintegration.com`, the account is almost certainly a Method onboarding/QA artifact — preserve UNCLASSIFIABLE with `needs_review = true` and note the contact domain in the reasoning. (Primary-email internal domains are already filtered server-side at the pull; this rule covers the contact-level variant.)

If a customer-looking domain is found → use it as the source for the WebFetch waterfall (Path A). Mark `content_source = 'contact_lookup'` if this becomes the primary classification signal.

If no usable alternate contact → fall through to Path B (freemail/partner) waterfall as before.

#### Refinements (added 2026-06-03 from retry-batch findings)

**CompanyName fallback when Email is empty.** Some Contacts rows have `Email = ""` but a populated `CompanyName` (e.g., RID 26250 surfaced `CompanyName: "Donna Santos Studio"` with no email). In this case, use `CompanyName` as the search seed for Step 1d.3 (WebSearch company + city) directly — skip the domain extraction.

**Parked-domain fallback.** If the contact-discovered domain WebFetches to a parking page (GoDaddy, HugeDomains, "for sale", "this site is under construction"), the customer business often still exists — only the website is gone. Drop straight to Step 1d.3 (WebSearch the company name) using the **domain root** (e.g., `dynamicroofingsolutions`) as the search query. This saved RIDs 35718 and 39982 in the 2026-06-03 retry batch.

**Mismatch detection (preserve UNCLASSIFIABLE).** Before chasing a contact-discovered domain, sanity-check it against the account name. If the alternate contact's `CompanyName` has **zero token overlap** with the account's `AccountFriendlyName` AND the contact's email is freemail, treat the contact as untrusted — preserve UNCLASSIFIABLE rather than classify based on a likely-wrong domain. Example: RID 143087 (`TNHH Trademark Sai Gon`, a Vietnamese LLC) had an alternate contact at a California behavioral-health clinic; the agent correctly flagged the mismatch and preserved UNCLASSIFIABLE instead of writing a wrong-but-confident label.

**ISV-partner test pattern.** Accounts whose primary `CustomerEmail` is at an ISV-partner domain (`rightnetworks.com`, others TBD) AND have zero alternate Contacts are likely partner-test artifacts. Preserve UNCLASSIFIABLE — do not WebSearch the partner's domain. (Code-side §14 filter expansion is tracked separately.)

### 1b. Extract email domain & choose enrichment path
Parse `CustomerEmail`. Determine `email_domain`. If the domain is a freemail provider (`gmail.com`, `yahoo.com`, `hotmail.com`, `outlook.com`, `aol.com`, `icloud.com`, `protonmail.com`, `zoho.com`, plus regional variants like `.co.uk`, `.ca`), classify the account as **freemail** and use Path B in 1c.

### 1c. Name-based overrides
If `AccountFriendlyName` contains (case-insensitive): `home watch`, `homewatch`, `property watch`, `house watch`:
- Classification: `Field Services & Trades` > `Home Watch` > `Home Watch Services`
- Confidence: 0.90, content_source: `name_override`
- Skip the rest of Step 1, write and continue

### 1d. Enrichment waterfall (two paths based on email)

**Run sources in order until you have useful business content (≥100 chars of substantive text). Use the FIRST source that yields a clear signal.**

**⚠️ Runtime note (2026-06-11):** Claude.ai cloud routines have their WebFetch requests blocked by ~90% of customer sites (Cloudflare-hosted small-business sites blocklist known cloud IPs; returns 403). **Clay is now the primary enrichment source, not the fallback.** WebFetch is still listed below — try it once, but expect failure in cloud sessions and fall through quickly. Local Claude Code sessions (residential IP) can still rely on WebFetch as the highest-fidelity source.

#### Path A — Real email domain (NOT freemail)

| # | Source | content_source label | How |
|---|---|---|---|
| 1 | **Clay enrichment** | `clay` | **PRIMARY.** Call `mcp__claude_ai_Clay__find-and-enrich-company` with company name + email domain. Clay returns structured industry tag (LinkedIn-derived), employee count, revenue band, tech stack — equivalent to a website read for most accounts and works regardless of bot-blocking. |
| 2 | WebSearch company + city | `search_verified` / `search_snippet` | Search `"{company name}"` (+city/state if known). If results include a real business website, capture the snippet. LinkedIn/Yelp/Google Maps listings are valid signals. |
| 3 | WebSearch BBB | `bbb_search` | Search `"{company name} BBB"`. If a BBB result appears in search snippets, capture. (Don't WebFetch BBB pages — they're behind Cloudflare too.) |
| 4 | WebFetch the email domain | `web_fetch` | **Best signal IF it works** (residential-IP sessions). In cloud routines this will mostly return 403 — accept and fall through. When it does succeed, it's the strongest source. |
| 5 | WebSearch the email domain | `domain_search` | Catches cached descriptions, press mentions when the site itself is dead. |
| 6 | Name + self-selected only | `name_only` | Last resort. Parse name for clues + Vertical fallback table. |

#### Path B — Freemail email domain (gmail/yahoo/etc.)

| # | Source | content_source label | How |
|---|---|---|---|
| 1 | `mcp__claude_ai_Alocet_MCP_for_Enrichement__get_contacts_for_account` | (per §1a-bis) | First, try to recover a real customer domain from contacts. If found, restart at Path A. |
| 2 | **Clay enrichment** | `clay` | **PRIMARY.** Try Clay by company name. Often returns nothing for purely-personal-name accounts, but works for any account with even minor web presence. |
| 3 | WebSearch company + city | `search_verified` / `search_snippet` | Search `"{company name}"` (+city/state if known). |
| 4 | WebSearch BBB | `bbb_search` | Search `"{company name} BBB"`. |
| 5 | Name + self-selected only | `name_only` | Last resort. Parse name for clues + Vertical fallback table. |

#### When to stop early

After steps 1-3, ask: **"Do I have enough signal to classify confidently (≥0.65 confidence at L2 level)?"**

- ✅ Yes → proceed to 1e.
- ❌ No → continue down the waterfall.

If you reach `name_only` without confident signal AND no positive evidence has been found, write UNCLASSIFIABLE rather than guessing.

### 1e. Classify in a single reasoning pass

#### ⛔ HARD RULE — FORBIDDEN CATCH-ALL L3 LABELS ⛔

The following L3 values are **PROHIBITED** unless you have explicit positive evidence:

| Forbidden L3 | Evidence required to use it |
|---|---|
| `Strategy & Management Consulting` | Website lists named partners, MBA-pedigreed bios, retainer engagements with named clients, or explicit "strategy consulting" / "management consulting" branding |
| `General Wholesale & Distribution` | Warehouse / distribution operation visible, multiple unrelated product lines, OR explicit "we distribute X" branding |

**If you don't have that evidence — write `l1 = l2 = l3 = UNCLASSIFIABLE` instead.**

These labels were the #1 source of false classifications in the May/June batches (190 mislabeled accounts). Most "Strategy & Management Consulting" labels were the AI guessing because a personal-name LLC had a generic website. That's exactly what Principle 4 forbids.

**The server enforces this.** `write_v7_classification` will return a 400 error if you try to write these L3 values with `content_source = name_only` OR `confidence < 0.65`. Don't waste a roundtrip — pick UNCLASSIFIABLE up front when evidence is thin.

The same "no catch-all" judgment applies to any `Other-*` or `General-*` L3 — but those are sometimes legitimate within a known category (e.g., "Other Specialty Construction" when you know it's construction but not the trade). Use judgment; the two L3s above are absolutely forbidden without positive evidence.

---

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
   - **P4 (server-enforced): Did you avoid forbidden catch-all L3s?** If you picked `Strategy & Management Consulting` or `General Wholesale & Distribution` with weak evidence, the server WILL reject — write UNCLASSIFIABLE instead (see the ⛔ callout at the top of §1e).
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
| `pre_enriched` | 0.45 | (self-vertical only, no web evidence — see gate below) |
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

**No-evidence gate (added 2026-06-18 — root-cause fix):** A label derived ONLY from the self-selected `Vertical` / `QBOIndustryType` with **no fetched web content** (i.e. `content_source` = `pre_enriched` or `name_only`, content_chars = 0) must cap `final_confidence ≤ 0.55` AND set `needs_review = true`. Rationale: the self-vertical is wrong 20–57% of the time in Retail/Automotive/Construction; never let a no-evidence label *look* trustworthy. (A **specific** `QBOIndustryType` confirmed by a quick web check is real evidence and is exempt — mark `content_source = 'qbo_industry'`.)

### 1h. Set the review flag
`needs_review = true` when ANY of:
- `final_confidence < 0.55`
- No `Vertical` AND `final_confidence < 0.60`
- Classification is `UNCLASSIFIABLE`
- Label derived from self-vertical/QBO with no web content (see no-evidence gate)

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
