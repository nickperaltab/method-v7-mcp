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

### 1a. Extract email domain
Parse `CustomerEmail`. If the domain is a freemail provider (`gmail.com`, `yahoo.com`, `hotmail.com`, `outlook.com`, `aol.com`, `icloud.com`, `protonmail.com`, `zoho.com`, plus regional variants like `.co.uk`, `.ca`), set `email_domain = ""` and skip steps 1c.Source 1, 1c.Source 4.

### 1b. Name-based overrides
If `AccountFriendlyName` contains (case-insensitive): `home watch`, `homewatch`, `property watch`, `house watch`:
- Classification: `Field Services & Trades` > `Home Watch` > `Home Watch Services`
- Confidence: 0.90, content_source: `name_override`
- Skip the rest of Step 1, write and continue

### 1c. Enrichment waterfall
Run each source in order until you have useful business content (≥100 chars of substantive text):

| # | Source | content_source label | How |
|---|---|---|---|
| 1 | WebFetch the email domain | `web_fetch` | Fetch `https://{email_domain}`. Treat parked/dead domains ("for sale", "coming soon", "under construction") as no content. |
| 2 | WebSearch BBB | `bbb_search` | Search `"{company name} BBB"`. If a BBB result, WebFetch the BBB page (structured industry/description data). |
| 3 | WebSearch company + city | `search_verified` / `search_snippet` | Search `"{company name}"` (add city/state if known). If results include a real business website, WebFetch it. If WebFetched content mentions the company name → `search_verified`; if you only have search snippets → `search_snippet`. LinkedIn/Yelp/Google Maps listings are valid signals. |
| 4 | WebSearch the email domain | `domain_search` | Search just the domain. Catches cached descriptions, directory listings, press mentions when the site itself is dead. |
| 5 | Name + self-selected only | `name_only` | Last resort. Parse the account name for industry clues. Use `Vertical` / `CustDatIndustry` / `Sector` as weak signals. |

### 1d. Classify in a single reasoning pass
With the taxonomy (incl. disambiguation_notes), 4 principles, and enrichment data in your context:

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

### 1e. Validate the (L1, L2, L3) tuple
Confirm the tuple exists in the valid combos set you parsed in 0a. If L3 is valid but L1/L2 are wrong, fix using the L3 lookup dict.

### 1f. Compute final confidence
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

### 1g. Set the review flag
`needs_review = true` when ANY of:
- `final_confidence < 0.50`
- No `Vertical` AND `final_confidence < 0.60`
- Classification is `UNCLASSIFIABLE`

### 1h. Write the result
Call MCP tool `write_v7_classification` with:
- `account_record_id` — the source account's RecordID (integer)
- `l1`, `l2`, `l3` — the classification labels (strings)
- `confidence` — `final_confidence` (0.0–1.0)
- `version` — `"V7.1"`
- `reasoning` — one sentence on why this label (≤200 chars)
- `needs_review` — boolean

Verify the response contains `success: true` and `new_record_id`. If not, log the error and continue to the next account.

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
