import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// IP hash - ham IP saklamak yerine SHA-256 hash kullan
export async function hashIP(ip: string): Promise<string> {
  const salt = import.meta.env.VITE_IP_SALT || 'anket-platform-salt-2024'
  const text = ip + salt
  
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(text)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    }
  } catch (e) {
    console.warn('Crypto.subtle not available, using fallback hash')
  }

  // Fallback: Simple string hash (non-cryptographic but consistent)
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return 'f-' + Math.abs(hash).toString(16)
}

export const generateUUID = () => {
  // crypto.randomUUID fallback for non-secure contexts (XAMPP/HTTP)
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (e) {}

  // Fallback for non-secure contexts (HTTP)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// Session token (non-UUID, used for cookies/session tracking)
export const generateSessionToken = (): string => {
  return 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// Cookie işlemleri
export const cookies = {
  set(name: string, value: string, days = 365) {
    const expires = new Date(Date.now() + days * 86400000).toUTCString()
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
  },
  get(name: string): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : null
  },
  remove(name: string) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
  },
}

// Anket durumu için anahtar oluştur
export function getSurveyKey(surveyId: string): string {
  return `survey_${surveyId}`
}

// Tarih formatlama
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

// Yüzde hesapla
export function calcPercent(value: number, total: number): number {
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}

// Slug oluştur (tam kelime - geriye dönük uyumluluk için korundu)
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Kısa Slug Üreteci: Başharfler + 4 haneli numara
// Örnek: "Kahramanmaraş Necip Fazil Şehir Hastanesi Anketi" → "knfsha-4721"
export function generateShortSlug(title: string): string {
  // Türkçe karakterleri dönüştür
  const normalized = title
    .replace(/ğ/gi, 'g').replace(/ü/gi, 'u').replace(/ş/gi, 's')
    .replace(/ı/gi, 'i').replace(/İ/g, 'i').replace(/ö/gi, 'o').replace(/ç/gi, 'c')

  // Kelimelerin baş harflerini al (max 8)
  const initials = normalized
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map(word => word[0].toLowerCase())
    .filter(c => /[a-z]/.test(c))
    .slice(0, 8)
    .join('')

  // 4 haneli rastgele numara (1000-9999)
  const num = Math.floor(Math.random() * 9000) + 1000

  return `${initials || 'anket'}-${num}`
}

// Bekle (ms)
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
