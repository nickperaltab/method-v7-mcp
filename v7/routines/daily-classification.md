# Daily V7 Classification Routine

This is the **source-of-truth prompt** for the daily Claude.ai routine that
classifies new and re-eligible Method CRM accounts. The routine fetches
this file at the start of every run, so updates here propagate the next
time the routine fires.

To update the routine's behavior: edit this file, commit, push. No
re-paste needed in Claude.ai (the bootstrap prompt there is two lines and
never changes).

---

## Required connectors

The Claude.ai routine must have these connectors enabled:

- **`method-v7-mcp`** — classification tools (`get_accounts_needing_v7_classification`, `write_v7_classification`, `get_contacts_for_account`, etc.)
- **`Google Cloud BigQuery`** — write tools enabled; gated by Google IAM so only authorized identities can actually write
- **`Slack`** — must be able to post to `#ai-alert-vertical` (channel `C0B3C0KEC78`)
- **`Firecrawl`** — for fetching bot-walled / Cloudflare-protected sites that direct WebFetch can't reach

---

## The routine prompt

```
Run the V7 industry classification pipeline on Method CRM accounts.

1. Load the latest rules (ONE TIME at start): fetch these four files from
   the method-v7-mcp GitHub repo:
   - https://raw.githubusercontent.com/nickperaltab/method-v7-mcp/main/v7/CLASSIFY-PIPELINE.md
   - https://raw.githubusercontent.com/nickperaltab/method-v7-mcp/main/v7/taxonomy/TAXONOMY_V7.csv
   - https://raw.githubusercontent.com/nickperaltab/method-v7-mcp/main/v7/rules/industry-classification-rules.md
   - https://raw.githubusercontent.com/nickperaltab/method-v7-mcp/main/v7/rules/classification-methodology.md
   Pay special attention to §1e ⛔ HARD RULE — the server rejects forbidden
   catch-all L3s (Strategy & Management Consulting, General Wholesale &
   Distribution) UNLESS content_source is in {web_fetch, firecrawl,
   search_verified, bbb_search, clay, clay_only} AND confidence >= 0.70.
   Tuple validation also enforced: L1/L2/L3 must be exact rows from
   TAXONOMY_V7.csv — never abbreviate "Manufacturing" to "Mfg".

2. Pull the next batch: call method-v7-mcp.get_accounts_needing_v7_classification(limit=200).
   If empty, confirm briefly and exit. (The MCP returns new accounts AND
   accounts whose current label is weak — conf<0.65 or UNCLASSIFIABLE —
   AND older than 7 days. The routine self-heals as the pipeline improves.)

3. For each account, run the FULL pipeline per CLASSIFY-PIPELINE.md. State
   your reasoning out loud per account so the transcript is the audit trail.

   Mandatory per-account steps (do NOT skip):
   a) §1a — read priors (QBOIndustryType, IndustryCode, Vertical,
      CustDatCountOfCustomers, CustDatCountOfEmployees, etc.)
   b) §1a-bis — if CustomerEmail is freemail / partner-managed /
      Method-internal, call method-v7-mcp.get_contacts_for_account(account_record_id)
      to recover the real customer domain.
      Test-account signal: if the ONLY contacts found are at mailinator.com,
      method.me, or methodintegration.com, this is a Method onboarding/QA
      artifact — preserve UNCLASSIFIABLE with needs_review=true.
   c) §1c HARD RULE — Name override has PRIORITY when name is self-explanatory.
      If the account name (or AccountFriendlyName) unambiguously describes
      the business activity, you MUST write content_source='name_override'
      at confidence 0.78–0.88. DO NOT write content_source='name_only' at
      conf <0.70 for self-explanatory names. Examples that REQUIRE name_override:
      "Bank of [Place]", "[X] Cleaning LLC", "[X] Plumbing Inc", "[X] Roofing",
      "[X] Violin Shop", "[X] Bakery", "[X] Background Checks", "Gutter Guys
      of [Place]". The name IS the evidence — don't downgrade for lack of a web fetch.
   d) §1d enrichment waterfall — REQUIRED before writing UNCLASSIFIABLE or
      any classification with confidence < 0.65 (and not already resolved
      by §1c):
      1. Direct WebFetch of the customer's domain.
      2. If it 403s, times out, or returns a bot-block/parked page → retry
         with the Firecrawl scrape tool (renders bot-walled pages WebFetch
         can't reach).
      3. If the domain is dead entirely → WebSearch the company NAME in
         quotes — BBB, D&B and Facebook results often identify the business.
      4. Clay fallback if still uncertain at the L2 level.

      ⚠️ Two identity traps (the tell: a real business name that doesn't match
      the email domain's website content):
      - Agency-email trap: email is at the customer's MARKETING AGENCY's
        domain. The site describes the agency, not the customer — classify
        from the account name, not the domain.
      - Partner-email trap: email is at a Method ISV PARTNER's domain. Do not
        inherit the partner's industry; if the customer's own identity can't
        be determined, write UNCLASSIFIABLE.
   e) §1e — classify, applying the 4 principles; pick an OperatingModel from:
      B2B_Producer | B2B_Distributor | DTC_Producer | Hybrid_Producer |
      Pure_Retailer | Service_Only | Service_With_Products | Project_Services | Hospitality
   f) STRONG-PRIORS RULE — When 2+ priors converge (any combination of
      QBO, NAICS, Vertical, name keyword pointing at the same L2/L3) AND
      both WebFetch + Firecrawl fail, do NOT write UNCLASSIFIABLE. Write
      the classification with content_source='pre_enriched' at confidence
      0.70–0.80. The priors ARE the signal. Example: NAICS 238220 +
      Vertical=Other + name "Gaz Confort" → write HVAC Services at 0.78,
      not UNCLASSIFIABLE at 0.20.
   g) JUNK NAICS RULE — If NAICS code clearly contradicts the account name
      or other priors (e.g., name 'cfodirect' with NAICS 81222 funeral
      homes), treat NAICS as untrusted and classify from the stronger
      signals. Junk-NAICS patterns: 999999, 99, or a code whose category
      label has zero word-overlap with the account name or other priors.
   h) CATCH-ALL EVIDENCE BAR — Before writing l3 in {Strategy & Management
      Consulting, General Wholesale & Distribution}, you MUST have:
      content_source in {web_fetch, firecrawl, search_verified, bbb_search,
      clay, clay_only} AND confidence >= 0.70. The server will reject
      anything else. For specialty consulting (compliance, government
      relations, fractional CFO, etc.), check for a more specific L3 in
      TAXONOMY_V7.csv before defaulting to Strategy & Management Consulting.
   i) UNCLASSIFIABLE RULE — Only write UNCLASSIFIABLE when confidence < 0.50
      AND enrichment was attempted (a-d all run) AND no priors converge
      (rule f above). UNCLASSIFIABLE is a "tried everything, genuinely no
      signal" verdict — never a shortcut.

   Then write THREE things:

   i) Label to Method (the source of truth + P4 + tuple validation gate):
      method-v7-mcp.write_v7_classification(
        account_record_id, l1, l2, l3, confidence, content_source,
        operating_model, business_description, short_reasoning, evidence_urls
      )

   ii) Same label MERGEd into BigQuery (keeps retention analytics live):
       Table: project-for-method-dw.v7_classification.account_labels
       MERGE on account_record_id (upsert). Column names mirror (i) but
       snake_cased.

   iii) Each WebFetch / WebSearch / Firecrawl scrape / Clay enrichment you
        ran INSERTed into the BigQuery enrichment table (audit + ML training):
        Table: project-for-method-dw.v7_classification.account_enrichment_raw
        Fields: account_record_id, source ('webfetch'|'websearch'|'firecrawl'|'bbb'|'clay'),
        url, query, prompt, content, content_chars, fetched_at,
        classification_run='routine-YYYY-MM-DD' (today's date)
        Do NOT insert junk pages (parked domains, webmail logins, bot-block
        pages) — they clog downstream review queues.
        DO insert every enrichment call, even if classification doesn't end
        up using it — the audit trail must reflect what was actually tried.

   Loose-on-BQ-failure: if (ii) or (iii) fail (permission, transient error),
   log and continue — the daily Method→BQ GitHub Action sync is a backup.
   Don't let a BQ hiccup halt the run.

4. End-of-run report (in transcript): classified / UNCLASSIFIABLE / server
   rejection counts + notable patterns.

5. Post a daily summary to Slack channel #ai-alert-vertical
   (mcp__claude_ai_Slack__slack_send_message, channel C0B3C0KEC78):

   📊 V7 Daily Classification — {today's date}
   • Processed: {N} accounts ({N} skipped as Method-internal)
   • Classified (conf ≥ 0.65): {N} ({%})
   • Needs review (conf 0.50–0.64): {N}
   • UNCLASSIFIABLE: {N} ({%})
   • Server rejections (P4 catch-all / invalid tuple): {N} / {N}

   How decisions were made (content_source counts):
   • clay: {N} | firecrawl: {N} | search_verified: {N} | search_snippet: {N}
   • web_fetch: {N} | contact_lookup: {N} | name_override: {N} | pre_enriched: {N}
   • name_only: {N} ← watch this; >25% means enrichment is being skipped

   Tool calls:
   • Clay: {N} | Firecrawl: {N} (saved {N} accounts that 403'd on WebFetch)
   • WebSearch: {N} | WebFetch: {N} attempted / {N} blocked (403)
   • get_contacts_for_account: {N} called, {N} recovered a real domain

   • Top 3 L1s: {list} | Top 3 OperatingModels: {list}
   • Notable: {1-2 sentences — overrides, partner clusters, taxonomy edges}
   • BQ write failures: {N or "none"}

   Prepend ⚠️ ATTENTION if any of: BQ write failures > 0, rejections > 20%
   of processed, or name_only > 25%. Otherwise prepend ✅. (Processed < 50
   is NORMAL now that the backlog is mostly clear — don't flag it.)
```

---

## How to update

1. Edit this file
2. `git commit -m "..."` + `git push`
3. The next scheduled routine run (or any "Run now" trigger) picks up the new version

No changes needed in Claude.ai. The bootstrap prompt there just says "fetch this URL and follow it."

## The Claude.ai bootstrap prompt

Paste this into the Claude.ai routine config ONCE. It never needs to change again — all updates happen via this repo.

```
Fetch https://raw.githubusercontent.com/nickperaltab/method-v7-mcp/main/v7/routines/daily-classification.md and follow the routine prompt section (the fenced code block under "## The routine prompt") exactly as written. Do not paraphrase; treat every instruction as mandatory.
```

## Version history

- **2026-06-30**: First version moved to repo. Includes name_override rule (§1c), strong-priors rule (§1f), junk-NAICS rule (§1g), catch-all evidence bar (§1h), and the P4 server tightening (allowlist of strong sources, conf ≥ 0.70).
