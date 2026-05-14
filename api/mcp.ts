// Vercel serverless function entry point for the MCP.
// Uses the Web Standards Streamable HTTP transport so the routine can
// connect over plain HTTPS.

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from '../src/server.js';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: Request): Promise<Response> {
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);
  return await transport.handleRequest(req);
}
