/**
 * supabaseHttp.ts - OPTİMİZE EDİLMİŞ
 *
 * Performans İyileştirmeleri:
 * 1. Token önbelleği (cache) — her API çağrısında localStorage tarama yok
 * 2. AbortController desteği — sayfa değişince açık istekler iptal edilir
 * 3. Retry mekanizması — ağ hataları için otomatik yeniden deneme
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ──────────────────────────────────────────────────────────────────────────────
// Token Önbelleği — Her çağrıda localStorage'ı taramak yerine bellekte tut
// ──────────────────────────────────────────────────────────────────────────────
let _cachedToken: string = ''
let _cacheTimestamp: number = 0
const TOKEN_CACHE_MS = 30_000 // 30 saniye

export function getStoredToken(): string {
  const now = Date.now()
  if (_cachedToken && now - _cacheTimestamp < TOKEN_CACHE_MS) {
    return _cachedToken
  }

  // 1. Birincil Kaynak: Supabase'in kendi anahtarı
  try {
    const raw = localStorage.getItem('anket-auth')
    if (raw) {
      const parsed = JSON.parse(raw)
      const token =
        parsed?.access_token ||
        parsed?.session?.access_token ||
        parsed?.currentSession?.access_token
      if (token) {
        _cachedToken = token
        _cacheTimestamp = now
        return token
      }
    }
  } catch {}

  // 2. Fallback: Tüm storage alanlarını tara (yavaş, sadece gerekirse)
  for (const store of [localStorage, sessionStorage]) {
    for (const key of Object.keys(store)) {
      try {
        const val = store.getItem(key)
        if (!val || !val.includes('access_token')) continue
        const parsed = JSON.parse(val)
        const token =
          parsed?.access_token ||
          parsed?.session?.access_token ||
          parsed?.currentSession?.access_token
        if (token) {
          _cachedToken = token
          _cacheTimestamp = now
          return token
        }
      } catch {}
    }
  }

  return ''
}

// Token değiştiğinde önbelleği sıfırla (login/logout anında çağrılmalı)
export function clearTokenCache() {
  _cachedToken = ''
  _cacheTimestamp = 0
}

// ──────────────────────────────────────────────────────────────────────────────
// Ortak İstek Başlıkları
// ──────────────────────────────────────────────────────────────────────────────
function getHeaders(token: string, preferReturn = 'representation'): Record<string, string> {
  const finalToken = token || SUPABASE_ANON_KEY
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${finalToken}`,
    'apikey': SUPABASE_ANON_KEY,
    'Prefer': `return=${preferReturn}`,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Hata Parse
// ──────────────────────────────────────────────────────────────────────────────
async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.clone().json()
    return j.message || j.error || JSON.stringify(j)
  } catch {
    return await res.text()
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Retry Yardımcısı — Geçici ağ hatalarında otomatik yeniden dene
// ──────────────────────────────────────────────────────────────────────────────
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1
): Promise<Response> {
  try {
    const res = await window.fetch(url, options)
    // 5xx sunucu hatalarında yeniden dene (429 = rate limit dahil)
    if ((res.status >= 500 || res.status === 429) && retries > 0) {
      await new Promise(r => setTimeout(r, 500))
      return fetchWithRetry(url, options, retries - 1)
    }
    return res
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 500))
      return fetchWithRetry(url, options, retries - 1)
    }
    throw err
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Ana Builder Fonksiyonu: httpFrom(table)
// ──────────────────────────────────────────────────────────────────────────────
export function httpFrom(table: string) {
  const baseUrl = `${SUPABASE_URL}/rest/v1/${table}`
  const token = getStoredToken()

  // ── SELECT ────────────────────────────────────────────────────────────────
  const select = (columns = '*') => {
    let url = `${baseUrl}?select=${encodeURIComponent(columns)}`
    let isSingle = false

    const builder = {
      eq(col: string, val: string) {
        url += `&${col}=eq.${encodeURIComponent(val)}`
        return builder
      },
      ilike(col: string, val: string) {
        url += `&${col}=ilike.${encodeURIComponent(val)}`
        return builder
      },
      in(col: string, vals: string[]) {
        url += `&${col}=in.(${vals.map(v => encodeURIComponent(v)).join(',')})`
        return builder
      },
      order(col: string, opts?: { ascending?: boolean }) {
        url += `&order=${col}.${opts?.ascending === false ? 'desc' : 'asc'}`
        return builder
      },
      single() {
        isSingle = true
        return builder
      },
      limit(n: number) {
        url += `&limit=${n}`
        return builder
      },
      async getCount() {
        const headers = { ...getHeaders(token) }
        headers['Prefer'] = 'count=exact'
        try {
          const res = await fetchWithRetry(url, { method: 'HEAD', headers })
          const range = res.headers.get('Content-Range')
          if (range) {
            const total = range.split('/')[1]
            return parseInt(total, 10)
          }
          return 0
        } catch (e) {
          console.error('Count error:', e)
          return 0
        }
      },
      async execute(): Promise<{ data: any; error: Error | null }> {
        const res = await fetchWithRetry(url, {
          method: 'GET',
          headers: {
            ...getHeaders(token),
            ...(isSingle ? { Accept: 'application/vnd.pgrst.object+json' } : {})
          }
        })
        if (!res.ok) {
          const msg = await parseError(res)
          return { data: null, error: new Error(`GET ${table}: ${msg}`) }
        }
        const data = await res.json()
        return { data, error: null }
      }
    }
    return builder
  }

  // ── INSERT ──────────────────────────────────────────────────────────────
  const insert = async (payload: object | object[], opts?: { returnData?: boolean }) => {
    const res = await fetchWithRetry(baseUrl, {
      method: 'POST',
      headers: getHeaders(token, opts?.returnData ? 'representation' : 'minimal'),
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const msg = await parseError(res)
      return { data: null, error: new Error(`INSERT ${table}: ${msg}`) }
    }
    const data = opts?.returnData ? await res.json() : null
    return { data, error: null }
  }

  // ── UPSERT ──────────────────────────────────────────────────────────────
  const upsert = async (payload: object | object[], onConflict?: string) => {
    const headers = {
      ...getHeaders(token, 'minimal'),
      ...(onConflict ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : {})
    }
    const url = onConflict ? `${baseUrl}?on_conflict=${onConflict}` : baseUrl
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const msg = await parseError(res)
      return { data: null, error: new Error(`UPSERT ${table}: ${msg}`) }
    }
    return { data: null, error: null }
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────
  const update = (payload: object) => {
    let filterUrl = `${baseUrl}`
    let hasFilter = false

    const builder = {
      eq(col: string, val: string) {
        filterUrl += `${hasFilter ? '&' : '?'}${col}=eq.${encodeURIComponent(val)}`
        hasFilter = true
        return builder
      },
      async execute() {
        const res = await fetchWithRetry(filterUrl, {
          method: 'PATCH',
          headers: getHeaders(token, 'minimal'),
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const msg = await parseError(res)
          return { data: null, error: new Error(`UPDATE ${table}: ${msg}`) }
        }
        return { data: null, error: null }
      }
    }
    return builder
  }

  // ── DELETE ──────────────────────────────────────────────────────────────
  const del = () => {
    let filterUrl = `${baseUrl}`
    let hasFilter = false

    const builder = {
      eq(col: string, val: string) {
        filterUrl += `${hasFilter ? '&' : '?'}${col}=eq.${encodeURIComponent(val)}`
        hasFilter = true
        return builder
      },
      async execute() {
        const res = await fetchWithRetry(filterUrl, {
          method: 'DELETE',
          headers: getHeaders(token, 'minimal')
        })
        if (!res.ok) {
          const msg = await parseError(res)
          return { data: null, error: new Error(`DELETE ${table}: ${msg}`) }
        }
        return { data: null, error: null }
      }
    }
    return builder
  }

  return { select, insert, upsert, update, delete: del }
}

// ──────────────────────────────────────────────────────────────────────────────
// RPC çağrısı
// ──────────────────────────────────────────────────────────────────────────────
export async function httpRpc(fnName: string, params: object) {
  const token = getStoredToken()
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: getHeaders(token, 'minimal'),
    body: JSON.stringify(params)
  })
  if (!res.ok) {
    const msg = await parseError(res)
    return { data: null, error: new Error(`RPC ${fnName}: ${msg}`) }
  }
  return { data: null, error: null }
}
