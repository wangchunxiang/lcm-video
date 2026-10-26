const BASE = '/api/admin';

export class ApiError extends Error {
  code: number;
  status: number;

  constructor(message: string, code: number, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, unknown>;
  json?: unknown;
}

function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, json } = options;
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const res = await fetch(BASE + path + buildQuery(query), {
    method,
    headers,
    body,
    credentials: 'same-origin',
  });

  let payload: { code?: number; msg?: string; data?: unknown } | null = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || !payload || payload.code !== 0) {
    throw new ApiError(payload?.msg ?? `请求失败（HTTP ${res.status}）`, payload?.code ?? -1, res.status);
  }

  return payload.data as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown>) => request<T>(path, { query }),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  put: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PUT', json }),
  del: <T>(path: string, query?: Record<string, unknown>) => request<T>(path, { method: 'DELETE', query }),
  upload: async (file: File): Promise<{ url: string; size: number }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(BASE + '/upload', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    });
    let payload: { code?: number; msg?: string; data?: unknown } | null = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    if (!res.ok || !payload || payload.code !== 0) {
      throw new ApiError(payload?.msg ?? `上传失败（HTTP ${res.status}）`, payload?.code ?? -1, res.status);
    }
    return payload.data as { url: string; size: number };
  },
};
