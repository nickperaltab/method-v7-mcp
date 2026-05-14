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
      'Writes a V7 classification result to the CustomerIndustryClassification table. The destination table is hardcoded — this tool can never write to any other table.',
      {
        account_record_id: z
          .number()
          .int()
          .positive()
          .describe('Source account RecordID (from CustomerMethodAccount)'),
        l1: z.string().min(1).describe('V7 L1 label'),
        l2: z.string().min(1).describe('V7 L2 label'),
        l3: z
          .string()
          .min(1)
          .describe(
            'V7 L3 label. For the current test table, stores the AccountRecordID as a string instead (will change in production schema).',
          ),
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
