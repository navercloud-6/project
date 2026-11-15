export async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || '요청을 처리하지 못했습니다.');
  }
  return response;
}
export async function api<T>(
  url: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await request(url, {
    method,
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.json();
}
