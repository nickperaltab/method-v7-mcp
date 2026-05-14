// MCP server setup. Transport-agnostic — used by both the stdio entry (local.ts)
// and the Vercel HTTP entry (api/mcp.ts).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getAccountsNeedingClassification,
  writeV7Classification,
} from './methodApi.js';

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'method-v7-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        'V7 industry classification tools for Method CRM. Reads candidate accounts from CustomerMethodAccount and writes classification results to CustomerIndustryClassification.',
    },
  );

  server.registerTool(
    'get_accounts_needing_v7_classification',
    {
      title: 'Get accounts needing V7 classification',
      description:
        'Returns Method customer accounts that need V7 industry classification. Filters to active, paying, non-test, non-Methoder accounts and excludes internal/template account names. Sorted by newest RecordID first.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe('Maximum number of accounts to return (default 200, max 500)'),
      },
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

  server.registerTool(
    'write_v7_classification',
    {
      title: 'Write V7 classification result',
      description:
        'Writes a V7 classification result to the CustomerIndustryClassification table. The destination table is hardcoded — this tool will NEVER write to any other table.',
      inputSchema: {
        account_record_id: z
          .number()
          .int()
          .positive()
          .describe('Source account RecordID (from CustomerMethodAccount)'),
        l1: z.string().min(1).describe('V7 L1 label (e.g., "Manufacturing & Distribution")'),
        l2: z.string().min(1).describe('V7 L2 label (e.g., "Industrial Manufacturing")'),
        l3: z
          .string()
          .min(1)
          .describe(
            'V7 L3 label. For the current test table, this stores the AccountRecordID as a string instead of the L3 label (will change in production schema).',
          ),
      },
    },
    async (args) => {
      const result = await writeV7Classification(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  return server;
}
