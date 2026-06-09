// OAuth 2.0 Protected Resource Metadata endpoint (RFC 9728).
//
// claude.ai's MCP connector fetches this URL during connector setup to
// discover where to authenticate the user. We point at Google as the
// authorization server; the MCP server itself just verifies the resulting
// Google access token (see src/platform/googleAuth.ts).

export async function GET(req: Request): Promise<Response> {
  const base = new URL(req.url).origin;
  const doc = {
    resource: `${base}/api/mcp`,
    authorization_servers: ['https://accounts.google.com'],
    scopes_supported: ['openid', 'email', 'profile'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${base}`,
  };
  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
