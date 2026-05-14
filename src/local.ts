// Local stdio entry point — for local Claude Code or CLI testing.
// Loads .env, spins up the MCP server, and connects over stdio.
//
// Usage: tsx src/local.ts
//
// To wire into local Claude Code as an MCP, add to ~/.claude.json:
//   "method-v7-local": {
//     "command": "tsx",
//     "args": ["/Users/nicolas/Desktop/method-v7-mcp/src/local.ts"]
//   }

import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for MCP messages — log to stderr only.
  console.error('method-v7-mcp listening on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
