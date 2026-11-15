import { session, checkOrigin, jsonBody, failure } from '@/lib/adapters/http';
import { journeys, operations, saveRecord } from '@/lib/server';
import { journeyInput, recordInput } from '@/lib/domain/contracts';
export const runtime = 'nodejs';
export async function GET() {
  try {
    return Response.json(
      { journeys: journeys(await session()) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const owner = await session();
    const data = journeyInput.parse(await jsonBody(request));
    return Response.json(
      { journey: operations.save(owner, data) },
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const owner = await session();
    const data = recordInput.parse(await jsonBody(request));
    return Response.json({ journey: saveRecord(owner, data) });
  } catch (e) {
    return failure(e);
  }
}
