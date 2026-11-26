export function rejectWriteRequest(request, kind = 'json') {
  const origin = request.headers.get('Origin');
  if (origin !== new URL(request.url).origin) {
    return Response.json({ error: 'このサイトから操作してください' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  // Query-only endpoints do not parse a body. Worker runtimes may expose an
  // empty body stream or synthesized Content-Type even for bodyless DELETE.
  if (kind === 'query') return null;
  const mediaType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
  const expected = kind === 'form' ? 'multipart/form-data' : 'application/json';
  if (mediaType !== expected) {
    return Response.json({ error: '送信形式が正しくありません' }, { status: 415, headers: { 'Cache-Control': 'no-store' } });
  }
  return null;
}
