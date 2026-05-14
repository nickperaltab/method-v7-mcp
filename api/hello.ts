export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  return new Response(
    JSON.stringify({
      hello: 'world',
      method: req.method,
      url: req.url,
      hasApiKey: !!process.env.METHOD_API_KEY,
      apiKeyPrefix: process.env.METHOD_API_KEY?.slice(0, 8) ?? null,
      nodeVersion: process.version,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
