import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'method-v7-mcp',
  description: 'V7 industry classification MCP server',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
