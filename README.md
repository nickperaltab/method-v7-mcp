# method-v7-mcp

Minimal V7-only MCP for the Method industry classification pipeline.

**Scope:** narrow. Two tools, hardcoded for the V7 use case. Not a general-purpose Method API client.

## Tools

| Tool | Purpose |
|---|---|
| `get_accounts_needing_v7_classification(limit?)` | Reads `CustomerMethodAccount`, filters to active paying non-test accounts (with name-pattern filter for Method internals), returns the V7-relevant fields. |
| `write_v7_classification(account_record_id, l1, l2, l3)` | Writes one row to `CustomerIndustryClassification`. Destination table is hardcoded — cannot write to any other table. |

## Local development

```bash
# Install deps
npm install

# Run as local stdio MCP
npm run dev

# Or hook into local Claude Code via ~/.claude.json:
#   "method-v7-local": {
#     "command": "tsx",
#     "args": ["/Users/nicolas/Desktop/method-v7-mcp/src/local.ts"]
#   }
```

## Deployment to Vercel

1. Push this repo to GitHub
2. Connect the repo to a Vercel project (under the Method team account)
3. Set the env var `METHOD_API_KEY` in the Vercel dashboard
4. Deploy — the MCP will be reachable at `https://<project>.vercel.app/`
5. Register it as a custom connector at [claude.ai/customize/connectors](https://claude.ai/customize/connectors)
6. Add the connector to routines that need V7 classification

## Architecture

The Method API key is held by the MCP server (in Vercel env vars) and never exposed to the routine that calls the tools. The routine sees only the tool surface — two functions with strongly-typed inputs. The destination table for writes is a string literal in the code, never derived from input.

## Files

```
method-v7-mcp/
├── src/
│   ├── server.ts       # MCP server + tool definitions (transport-agnostic)
│   ├── methodApi.ts    # fetch() wrapper for Method API + tool implementations
│   └── local.ts        # stdio entry point for local Claude Code
├── api/
│   └── mcp.ts          # Vercel serverless function (HTTP entry)
├── tsconfig.json
├── package.json
├── vercel.json
└── .env                # local secrets only (gitignored)
```

## Spec

Full pipeline architecture and rationale: `Rev Ops System/01-ACTIVE-PROJECTS/Classification-Pipeline/V7-Pipeline-Spec.md`
