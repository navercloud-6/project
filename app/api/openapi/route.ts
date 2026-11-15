import { openApiDocument } from '@/lib/adapters/openapi';

export const runtime = 'nodejs';
export function GET() {
  return Response.json(openApiDocument, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
