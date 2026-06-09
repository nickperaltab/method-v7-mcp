# V7 Classification Data Flow

## The two-tier architecture

```
                ┌─────────────────────────────────────────┐
                │  Classifier (subagent / Claude.ai       │
                │  routine / Claude Code session)         │
                └──────────────────┬──────────────────────┘
                                   │ write_v7_classification(MCP tool)
                                   ▼
                ┌─────────────────────────────────────────┐
                │  Method API: POST to                    │
                │  CustomerIndustryClassification         │
                │  (UPSERT, one row per AccountRecordID)  │
                │                                         │
                │  ◀── SOURCE OF TRUTH ──▶                │
                └──────────────────┬──────────────────────┘
                                   │ daily GitHub Action @ 04:07 ET
                                   │ (.github/workflows/sync-method-to-bq.yml)
                                   ▼
                ┌─────────────────────────────────────────┐
                │  BigQuery:                              │
                │    project-for-method-dw                │
                │    .v7_classification                   │
                │      .account_labels   (current state)  │
                │      .label_history    (audit log)      │
                │                                         │
                │  ◀── ANALYTICS MIRROR ──▶               │
                └─────────────────────────────────────────┘
```

## What writes where

- **`write_v7_classification` MCP tool** → POSTs to Method's
  `CustomerIndustryClassification` table via REST API. **Never writes to BQ
  directly.** This is what every classifier (cleanup batches, the daily
  routine, GRR backfill subagents, ad-hoc Claude Code work) calls.
- **GitHub Actions cron** (`.github/workflows/sync-method-to-bq.yml`) →
  pulls Method's full classification table once a day, MERGE-updates
  `account_labels`, INSERT-appends to `label_history`. Runs at 04:07 ET
  (after the routine fires at 03:00 ET) so the morning has fresh BQ data.

## Why this matters

Method is the source of truth because:
- The MCP tool has built-in P4 enforcement (server rejects forbidden L3s)
- UPSERT semantics one row per account
- Single auth path (Google OAuth or Method API key)

BQ is the analytics mirror because:
- Retention analysis (NRR/GRR by industry) joins classifications to
  `revenue.int_customers` etc.
- All the retention dashboards run from BQ
- BQ supports the dimensional cuts (industry × OperatingModel × tenure)
  that Method's table can't

## What broke in May/June 2026 (precedent)

The sync script (`sync_method_to_bq.py` in the Obsidian vault at
`05-SCRATCH/2026-03-23-classification/`) existed since the first
classifications were written. But it was only run manually. Between Jun 2
and Jun 9, no one ran it → BQ drifted 7 days behind Method → industry-cut
GRR analysis would have been wrong by ~1,900 missing labels.

**Lesson learned**: any analytics mirror needs an automated sync. Manual
sync = inevitable drift.

## How to verify BQ is current

```sql
SELECT COUNT(*) AS bq_rows, MAX(classified_at) AS latest
FROM `project-for-method-dw.v7_classification.account_labels`;
```

Compare to Method API count via the MCP `get_recent_classifications` tool
or curl to `/CustomerIndustryClassification`. If BQ is more than 1 day
behind Method's latest `ClassifiedAt`, check whether the GitHub Action ran.

## Required GitHub secrets

For the sync workflow to run, the `method-v7-mcp` repo needs:
- `METHOD_API_KEY` — same value as in Vercel env vars
- `GCP_SERVICE_ACCOUNT_KEY` — JSON key for a service account with BigQuery
  Data Editor on `project-for-method-dw.v7_classification`

## Manual catch-up

If the cron breaks and BQ drifts again, run the catch-up locally:

```bash
cd "~/Desktop/Obsidian Vault/Rev Ops System/05-SCRATCH/2026-03-23-classification"
python3 sync_method_to_bq.py           # live
DRY_RUN=1 python3 sync_method_to_bq.py # preview
```

Or trigger the workflow manually: GitHub repo → Actions → sync-method-to-bq → Run workflow.
