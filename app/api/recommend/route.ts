import { session, checkOrigin, jsonBody, failure } from '@/lib/adapters/http';
import { recommendationInput } from '@/lib/domain/contracts';
import { operations } from '@/lib/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const owner = await session();
    const input = recommendationInput.parse(await jsonBody(request));
    return Response.json(await operations.recommendation(owner, input));
  } catch (e) {
    return failure(e);
  }
}
