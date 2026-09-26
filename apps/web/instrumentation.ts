/** Errors thrown while rendering pages or in route handlers that don't catch them. */
export async function onRequestError(err: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError, safePath } = await import("@dinkuan/core/server");
  const id = request.headers["x-vercel-id"];
  await reportError(err, { path: safePath(request.path), method: request.method, requestId: Array.isArray(id) ? id[0] : id });
}
