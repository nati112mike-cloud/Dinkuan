const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function getToken(): string | null {
  try {
    return localStorage.getItem("dk_scanner_token");
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem("dk_scanner_token", token);
    else localStorage.removeItem("dk_scanner_token");
  } catch {
    // storage blocked
  }
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error?.code ?? "NETWORK", res.status);
  return json.data as T;
}
