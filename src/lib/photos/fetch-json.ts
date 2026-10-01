// Client helper for photo/album mutations: parses the JSON body and throws
// (with the API's `error` message when present) on a non-2xx response, so
// TanStack mutations land in onError instead of treating a 4xx/5xx as success.
export async function fetchJsonOrThrow<T = unknown>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}
