// MCP server route — Vercel + Next.js + mcp-handler pattern.
// Tool implementations live in src/methodApi.ts (unchanged).
// This file just wires those implementations into the MCP handler.

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import {
  getAccountsNeedingClassification,
  writeV7Classification,
} from '../../../src/methodApi';

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'get_accounts_needing_v7_classification',
      'Returns Method customer accounts that need V7 industry classification. Filters to active, paying, non-test, non-Methoder accounts and excludes internal/template account names. Sorted by newest RecordID first.',
      {
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe('Max accounts to return (default 200, max 500)'),
      },
      async ({ limit }) => {
        const accounts = await getAccountsNeedingClassification(limit ?? 200);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: accounts.length, accounts }, null, 2),
            },
          ],
        };
      },
    );

    server.tool(
      'write_v7_classification',
      'Writes a V7 classification result to the CustomerIndustryClassification table. The destination table is hardcoded — this tool can never write to any other table. Upsert behavior: if a row already exists for the given account_record_id, it is updated; otherwise a new row is created. This enforces one current classification per account.',
      {
        account_record_id: z
          .number()
          .int()
          .positive()
          .describe('Source account RecordID (from CustomerMethodAccount). Required.'),
        l1: z.string().min(1).max(255).describe('V7 L1 label (e.g., "Manufacturing & Distribution")'),
        l2: z.string().min(1).max(255).describe('V7 L2 label (e.g., "Industrial Manufacturing")'),
        l3: z.string().min(1).max(255).describe('V7 L3 label (the full V7 L3 name)'),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Final confidence score, 0.00–1.00'),
        version: z
          .string()
          .max(20)
          .optional()
          .describe('Taxonomy version (e.g., "V7.1")'),
        classified_at: z
          .string()
          .optional()
          .describe('ISO 8601 timestamp of when classification was made. Defaults to server time if omitted.'),
        needs_review: z
          .boolean()
          .optional()
          .describe('True when confidence < 0.55 or rule-flagged'),
        content_source: z
          .string()
          .max(50)
          .optional()
          .describe('Enrichment source that drove the label: web_fetch | bbb_search | search_verified | search_snippet | clay_only | name_only | name_override | pre_enriched'),
        business_description: z
          .string()
          .max(500)
          .optional()
          .describe('1–2 sentence summary of what the business does'),
        short_reasoning: z
          .string()
          .max(500)
          .optional()
          .describe('One sentence on why this L1/L2/L3 was chosen'),
        confidence_reason: z
          .string()
          .max(500)
          .optional()
          .describe('One sentence explaining the confidence number'),
        evidence_urls: z
          .string()
          .max(1000)
          .optional()
          .describe('Comma-separated URLs of evidence (websites, BBB pages, LinkedIn, etc.)'),
      },
      async (args) => {
        const result = await writeV7Classification(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    );
  },
  {},
  { basePath: '/api' },
);

export { handler as GET, handler as POST, handler as DELETE };
