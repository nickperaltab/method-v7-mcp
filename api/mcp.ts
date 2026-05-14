// Vercel serverless function entry point for the MCP.
// Uses the Web Standards Streamable HTTP transport in stateless JSON mode
// because Vercel serverless functions don't keep state across requests
// and long-lived SSE streams aren't reliable in this runtime.

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from '../src/server.js';

export const runtime = 'edge';

export default async function handler(req: Request): Promise<Response> {
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    // No sessionIdGenerator -> stateless mode (correct for serverless)
    // enableJsonResponse -> return plain JSON responses, no SSE streams
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return await transport.handleRequest(req);
}
