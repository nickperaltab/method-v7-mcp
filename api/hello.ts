export const runtime = 'edge';

export default async function handler(req: Request): Promise<Response> {
  return new Response(
    JSON.stringify({
      hello: 'world',
      method: req.method,
      hasApiKey: !!process.env.METHOD_API_KEY,
      apiKeyPrefix: process.env.METHOD_API_KEY?.slice(0, 8) ?? null,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
