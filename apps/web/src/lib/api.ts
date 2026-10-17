'use client';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1').replace(/\/$/, '');

const ACCESS_KEY = 'bc.access';
const REFRESH_KEY = 'bc.refresh';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible: la sesión dura lo que la pestaña */
  }
}

let memoryAccess: string | null = null;
let memoryRefresh: string | null = null;

export const tokens = {
  get access() {
    return memoryAccess ?? read(ACCESS_KEY);
  },
  get refresh() {
    return memoryRefresh ?? read(REFRESH_KEY);
  },
  set(pair: { accessToken: string; refreshToken: string }) {
    memoryAccess = pair.accessToken;
    memoryRefresh = pair.refreshToken;
    write(ACCESS_KEY, pair.accessToken);
    write(REFRESH_KEY, pair.refreshToken);
  },
  clear() {
    memoryAccess = null;
    memoryRefresh = null;
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
  },
};

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokens.refresh;
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        tokens.clear();
        return false;
      }
      tokens.set(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {};
  const access = tokens.access;
  if (access) headers.Authorization = `Bearer ${access}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: opts.method ?? 'GET', headers, body, signal: opts.signal });
  } catch {
    throw new ApiError('No se ha podido conectar con el servidor', 0);
  }

  if (res.status === 401 && access && !retried && (await tryRefresh())) {
    return api<T>(path, opts, true);
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
    throw new ApiError(msg || `Error ${res.status}`, res.status, data?.code, data);
  }
  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/** Descarga un documento protegido con el token y lo abre en una pestaña nueva. */
export async function openDocument(id: string) {
  const headers: Record<string, string> = {};
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  const res = await fetch(`${API_URL}/documents/${id}/download`, { headers });
  if (!res.ok) {
    const data = safeJson(await res.text());
    throw new ApiError(data?.message ?? 'No se ha podido abrir el documento', res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
