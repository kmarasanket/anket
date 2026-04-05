// Supabase veritabanı tip tanımları
// Bu tipler Supabase'deki tablolarla birebir eşleşir

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type QuestionType =
  | 'section'     // Bölüm Başlığı
  | 'radio'       // Tek seçimli
  | 'checkbox'    // Çok seçimli
  | 'text'        // Kısa metin
  | 'textarea'    // Uzun metin
  | 'rating'      // Yıldız (1-5)
  | 'nps'         // Net Promoter Score (0-10)
  | 'number'      // Sayı
  | 'date'        // Tarih
  | 'dropdown'    // Açılır liste
  | 'likert'      // Likert ölçeği
  | 'matrix'      // Matris
  | 'email'       // E-posta
  | 'phone'       // Telefon

export type UserRole = 'super_admin' | 'admin'
export type SurveyStatus = 'draft' | 'active' | 'closed' | 'paused'

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          slug: string
          logo_url: string | null
          description: string | null
          settings: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tenants']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['tenants']['Insert']>
      }
      profiles: {
        Row: {
          id: string
          tenant_id: string | null
          full_name: string
          role: UserRole
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      surveys: {
        Row: {
          id: string
          tenant_id: string
          title: string
          description: string | null
          slug: string
          status: SurveyStatus
          welcome_message: string | null
          thank_you_message: string | null
          allow_multiple_responses: boolean
          track_ip: boolean
          use_cookies: boolean
          require_login: boolean
          settings: Json
          starts_at: string | null
          ends_at: string | null
          response_count: number
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['surveys']['Row'], 'id' | 'response_count' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['surveys']['Insert']>
      }
      questions: {
        Row: {
          id: string
          survey_id: string
          type: QuestionType
          title: string
          description: string | null
          placeholder: string | null
          options: Json
          settings: Json
          order_index: number
          is_required: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['questions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['questions']['Insert']>
      }
      responses: {
        Row: {
          id: string
          survey_id: string
          tenant_id: string
          session_token: string
          ip_hash: string | null
          started_at: string
          completed_at: string | null
          is_complete: boolean
          metadata: Json
        }
        Insert: Omit<Database['public']['Tables']['responses']['Row'], 'id' | 'started_at'>
        Update: Partial<Database['public']['Tables']['responses']['Insert']>
      }
      response_answers: {
        Row: {
          id: string
          response_id: string
          question_id: string
          answer: Json
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['response_answers']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['response_answers']['Insert']>
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string | null
          tenant_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          metadata: Json
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>
        Update: never
      }
    }
  }
}

// Kolay kullanım için tip kısayolları
export type Tenant = Database['public']['Tables']['tenants']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Survey = Database['public']['Tables']['surveys']['Row']
export type Question = Database['public']['Tables']['questions']['Row']
export type Response = Database['public']['Tables']['responses']['Row']
export type ResponseAnswer = Database['public']['Tables']['response_answers']['Row']
