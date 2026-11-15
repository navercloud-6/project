import { assistantInput } from '@/lib/domain/assistant';
import { checkOrigin, session, jsonBody, failure } from '@/lib/adapters/http';
import { operations } from '@/lib/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const owner = await session();
    const data = assistantInput.parse(await jsonBody(request, 16000));
    const result = await operations.assistant(owner, data);
    if (result instanceof Uint8Array)
      return new Response(new Uint8Array(result), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'private, no-store',
        },
      });
    return Response.json(result);
  } catch (error) {
    return failure(error);
  }
}
