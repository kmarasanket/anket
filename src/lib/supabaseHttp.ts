/**
 * supabaseHttp.ts
 *
 * Supabase kütüphanesi kurumsal/hastane ağlarında donabilmektedir.
 * Bu modül, TÜM veritabanı işlemlerini standart window.fetch ile yapar.
 * Supabase JS kütüphanesine sıfır bağımlılık -> ağ kısıtlamalarını tamamen aşar.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ──────────────────────────────────────────────────────────────────────────────
// Token Çözücü: Supabase'in `anket-auth` anahtarındaki token'ı bulur
// ──────────────────────────────────────────────────────────────────────────────
export function getStoredToken(): string {
  // 1. Bilinen anahtar (storageKey: 'anket-auth')
  try {
    const raw = localStorage.getItem('anket-auth')
    if (raw) {
      const parsed = JSON.parse(raw)
      const token =
        parsed?.access_token ||
        parsed?.session?.access_token ||
        parsed?.currentSession?.access_token
      if (token) return token
    }
  } catch {}

  // 2. Scavenger Fallback: tüm depolama alanlarını tara
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
        if (token) return token
      } catch {}
    }
  }

  return ''
}

// ──────────────────────────────────────────────────────────────────────────────
// Ortak İstek Başlıkları
// ──────────────────────────────────────────────────────────────────────────────
function getHeaders(token: string, preferReturn = 'representation'): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
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
// Ana Builder Fonksiyonu: httpFrom(table)
// Her metot yeni bir builder döndürür (immutable chain — URL mutation yok)
// ──────────────────────────────────────────────────────────────────────────────
export function httpFrom(table: string) {
  const baseUrl = `${SUPABASE_URL}/rest/v1/${table}`
  const token = getStoredToken()

  // ── SELECT ────────────────────────────────────────────────────────────────
  const select = (columns = '*') => {
    // Her select çağrısı kendi bağımsız URL state'ini yönetir
    let url = `${baseUrl}?select=${encodeURIComponent(columns)}`
    let isSingle = false

    const builder = {
      eq(col: string, val: string) {
        url += `&${col}=eq.${encodeURIComponent(val)}`
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
      async execute(): Promise<{ data: any; error: Error | null }> {
        const res = await window.fetch(url, {
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
    const res = await window.fetch(baseUrl, {
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
    const res = await window.fetch(url, {
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
        const res = await window.fetch(filterUrl, {
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
        const res = await window.fetch(filterUrl, {
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
// RPC çağrısı (fonksiyon çalıştır)
// ──────────────────────────────────────────────────────────────────────────────
export async function httpRpc(fnName: string, params: object) {
  const token = getStoredToken()
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`
  const res = await window.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(params)
  })
  if (!res.ok) {
    let msg = ''
    try { msg = (await res.clone().json()).message } catch { msg = await res.text() }
    return { data: null, error: new Error(`RPC ${fnName}: ${msg}`) }
  }
  return { data: null, error: null }
}
