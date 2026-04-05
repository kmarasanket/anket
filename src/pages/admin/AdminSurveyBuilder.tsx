import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { 
  Save, ArrowLeft, Plus, Trash2, 
  AlignLeft, CheckSquare, CircleDot, Star, Calendar, Baseline
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { slugify } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import type { QuestionType } from '../../lib/database.types'

// Tüm soru tiplerinin listesi
const QUESTION_TYPES: { type: QuestionType; label: string; icon: any }[] = [
  { type: 'section', label: 'Bölüm Başlığı', icon: Baseline },
  { type: 'text', label: 'Kısa Metin', icon: Baseline },
  { type: 'textarea', label: 'Uzun Metin (Açıklama)', icon: AlignLeft },
  { type: 'radio', label: 'Tek Seçimli', icon: CircleDot },
  { type: 'checkbox', label: 'Çok Seçimli', icon: CheckSquare },
  { type: 'rating', label: 'Yıldız/Derece', icon: Star },
  { type: 'date', label: 'Tarih', icon: Calendar },
]

export default function AdminSurveyBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { tenant, user } = useAuthStore()
  const { addNotification } = useNotificationStore()
  
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  
  // Anket Ana Bilgileri
  const [surveyData, setSurveyData] = useState({
    title: '',
    description: '',
    status: 'draft' as 'draft' | 'active' | 'closed',
    welcome_message: '',
    thank_you_message: 'Ankete katıldığınız için teşekkür ederiz.',
    slug: ''
  })

  // Sorular Listesi
  const [questions, setQuestions] = useState<any[]>([])

  useEffect(() => {
    if (!id) return
    const loadSurvey = async () => {
      setLoading(true)
      try {
        const { data: survey, error } = await supabase.from('surveys').select('*').eq('id', id).single()
        if (error) throw error
        if (survey) {
          setSurveyData({
            title: survey.title,
            description: survey.description || '',
            status: survey.status,
            welcome_message: survey.welcome_message || '',
            thank_you_message: survey.thank_you_message || '',
            slug: survey.slug
          })
          const { data: qData, error: qError } = await supabase.from('questions').select('*').eq('survey_id', id).order('order_index')
          if (qError) throw qError
          setQuestions(qData || [])
        }
      } catch (err: any) {
        addNotification('Anket yüklenirken bir hata oluştu: ' + (err.message || ''), 'error')
      } finally {
        setLoading(false)
      }
    }
    loadSurvey()
  }, [id])

  const addQuestion = () => {
    const newQ = {
      id: uuidv4(),
      survey_id: id || '',
      type: 'text' as QuestionType,
      title: '',
      description: '',
      is_required: true,
      options: ['Seçenek 1'], // Sadece radio/checkbox için gerekli
      order_index: questions.length,
      _isNew: true // db tablosunda olmayan alan, sonradan filtrelenir
    }
    setQuestions([...questions, newQ])
  }

  const addSection = () => {
    const newQ = {
      id: uuidv4(),
      survey_id: id || '',
      type: 'section' as QuestionType,
      title: '',
      description: '',
      is_required: false,
      options: null,
      order_index: questions.length,
      _isNew: true
    }
    setQuestions([...questions, newQ])
  }

  const updateQuestion = (index: number, updates: any) => {
    const updated = [...questions]
    updated[index] = { ...updated[index], ...updates }
    setQuestions(updated)
  }

  const removeQuestion = (index: number) => {
    const updated = [...questions]
    updated.splice(index, 1)
    setQuestions(updated)
  }

  const handleSave = async () => {
    if (!tenant || !user) {
        addNotification('Kurum veya kullanıcı bilgisi eksik, lütfen sayfayı yenileyin.', 'error')
        return
    }
    
    if (!surveyData.title.trim()) {
      addNotification('Lütfen bir anket başlığı girin.', 'warning')
      return
    }

    setSaving(true)
    
    try {
      setSaving(true)
      console.log('Kayıt işlemi başlatıldı (Stabil Mod)...')
      
      let accessToken = ''
      
      // 1. ADIM: Oturum Anahtarı Erişimi
      try {
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 1500))
        ]) as any
        if (session) accessToken = session.access_token
      } catch (e) {
        console.warn('Ondine session API gecikti, depolama tarayıcısı devreye giriyor...')
      }

      // Scavenger Fallback (Oturum kilitlenmelerini aşmak için)
      if (!accessToken) {
        const allStorages = [localStorage, sessionStorage]
        for (const store of allStorages) {
          for (const key of Object.keys(store)) {
            try {
              const val = store.getItem(key)
              if (val && (val.includes('access_token') || val.includes('token'))) {
                const parsed = JSON.parse(val)
                const found = parsed.access_token || (parsed.session && parsed.session.access_token) || parsed.token
                if (found) { accessToken = found; break; }
              }
            } catch (err) {}
          }
          if (accessToken) break
        }
      }

      if (!accessToken) {
        addNotification('Oturum anahtarı alınamadı. Lütfen sayfayı yenileyip tekrar giriş yapın.', 'error')
        return
      }

      // 2. ADIM: Veri Hazırlığı
      const surveyId = id || uuidv4()
      const baseSlug = slugify(surveyData.title).substring(0, 50)
      const finalSlug = id ? (surveyData.slug || baseSlug) : `${baseSlug}-${Math.random().toString(36).substr(2, 5)}`
      
      const rpcUrl = `${(supabase as any).supabaseUrl}/rest/v1/rpc/save_survey_secure`
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': `${(supabase as any).supabaseKey}`,
        'Prefer': 'return=minimal'
      }
      
      const body = JSON.stringify({
        p_id: surveyId,
        p_tenant_id: tenant.id,
        p_title: surveyData.title.trim(),
        p_description: surveyData.description || null,
        p_slug: finalSlug,
        p_status: surveyData.status,
        p_welcome_message: surveyData.welcome_message || null,
        p_thank_you_message: surveyData.thank_you_message || null
      })

      // 3. ADIM: Güvenli Kayıt (RPC via Raw Fetch)
      console.log('Anket verileri gönderiliyor...')
      const response = await window.fetch(rpcUrl, {
        method: 'POST',
        headers,
        body
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Sunucu Hatası: ${errorText}`)
      }

      // 4. ADIM: Soruların Senkronizasyonu
      console.log('Sorular güncelleniyor...')
      // Mevcut soruları temizle
      await supabase.from('questions').delete().eq('survey_id', surveyId)
      
      // Yeni soruları ekle
      if (questions.length > 0) {
        const questionsToInsert = questions.map((q, idx) => ({
          survey_id: surveyId,
          type: q.type,
          title: q.title || 'İsimsiz Soru',
          description: q.description || null,
          is_required: !!q.is_required,
          order_index: idx,
          options: q.type === 'radio' || q.type === 'checkbox' ? q.options : null
        }))
        
        const { error: qError } = await supabase.from('questions').insert(questionsToInsert)
        if (qError) throw qError
      }

      console.log('Kayıt başarılı!')
      addNotification('Anket başarıyla kaydedildi.', 'success')
      
      // Veritabanı yansıması için çok kısa bir bekleme (300ms)
      setTimeout(() => {
        navigate('/admin/anketler')
      }, 300)

    } catch (e: any) {
      console.error('Kayıt Hatası:', e)
      addNotification('Kayıt sırasında bir hata oluştu: ' + (e.message || 'Bilinmeyen Hata'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-12 text-center text-dark-400">Veriler yükleniyor...</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in">
      
      {/* Üst Bar: Geri ve Kaydet */}
      <div className="flex items-center justify-between bg-dark-900 border border-dark-800 p-4 rounded-2xl sticky top-4 z-40 shadow-card">
        <button onClick={() => navigate(-1)} className="btn-sm btn-ghost">
          <ArrowLeft className="w-4 h-4" /> Geri
        </button>
        <div className="flex items-center gap-3">
          <select 
            value={surveyData.status} 
            onChange={e => setSurveyData({...surveyData, status: e.target.value as any})}
            className="input py-1.5 h-auto text-sm bg-dark-950"
          >
            <option value="draft">Taslak</option>
            <option value="active">Aktif (Yayında)</option>
            <option value="closed">Kapalı</option>
          </select>
          <button onClick={handleSave} disabled={saving} className="btn-md btn-primary">
            <Save className="w-4 h-4" /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>

      {/* Anket Başlığı ve Açıklaması */}
      <div className="card p-0 overflow-hidden border-t-8 border-t-primary-500">
        <div className="p-8 space-y-4">
          <input 
            value={surveyData.title}
            onChange={e => setSurveyData({...surveyData, title: e.target.value})}
            className="w-full bg-transparent text-4xl font-display font-bold text-dark-50 focus:outline-none placeholder-dark-600"
            placeholder="İsimsiz Anket"
          />
          <textarea 
            value={surveyData.description}
            onChange={e => setSurveyData({...surveyData, description: e.target.value})}
            className="w-full bg-transparent text-dark-300 focus:outline-none resize-none placeholder-dark-600"
            placeholder="Anket açıklaması (isteğe bağlı)..."
            rows={2}
          />
        </div>
      </div>

      {/* Sorular */}
      <div className="space-y-6">
        {questions.map((q, qIndex) => (
          <div key={q.id} className={`card p-6 transition-all focus-within:shadow-glow-sm ${
            q.type === 'section' ? 'border-l-8 border-l-purple-500 bg-purple-500/5' : 'border-l-4 border-l-blue-500'
          }`}>
            
            {/* Soru Üst Kısım: Başlık ve Tür */}
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              {q.type === 'section' ? (
                <div className="flex-1 space-y-2">
                  <input 
                    value={q.title}
                    onChange={e => updateQuestion(qIndex, { title: e.target.value })}
                    className="input text-2xl font-display font-bold bg-dark-900 border-none border-b border-dark-700 rounded-none px-0 text-purple-400 focus:border-purple-500 w-full placeholder-purple-500/30"
                    placeholder="Yeni Bölüm"
                  />
                  <input 
                    value={q.description || ''}
                    onChange={e => updateQuestion(qIndex, { description: e.target.value })}
                    className="input text-sm text-dark-300 bg-transparent border-none px-0 w-full focus:ring-0 placeholder-dark-500"
                    placeholder="Bölüm alt başlığı (isteğe bağlı)"
                  />
                </div>
              ) : (
                <input 
                  value={q.title}
                  onChange={e => updateQuestion(qIndex, { title: e.target.value })}
                  className="input text-lg font-medium bg-dark-950 border-dark-800 flex-1 placeholder-dark-600"
                  placeholder="Soru Başlığı"
                />
              )}
              <select 
                value={q.type}
                onChange={e => updateQuestion(qIndex, { type: e.target.value })}
                className="input w-full md:w-48 bg-dark-950 border-dark-800 h-auto"
              >
                {QUESTION_TYPES.map(qt => (
                  <option key={qt.type} value={qt.type}>{qt.label}</option>
                ))}
              </select>
            </div>

            {/* Seçenekler (Eğer Çoktan Seçmeli Veya Onay Kutusu İse) */}
            {(q.type === 'radio' || q.type === 'checkbox') && (
              <div className="space-y-2 mt-4 ml-2">
                {q.options?.map((opt: string, oIndex: number) => (
                  <div key={oIndex} className="flex items-center gap-3">
                    <div className={`w-4 h-4 border-2 border-dark-500 ${q.type === 'radio' ? 'rounded-full' : 'rounded-sm'}`} />
                    <input 
                      value={opt}
                      onChange={e => {
                        const newOpts = [...q.options]
                        newOpts[oIndex] = e.target.value
                        updateQuestion(qIndex, { options: newOpts })
                      }}
                      className="bg-transparent text-dark-200 focus:outline-none focus:border-b focus:border-primary-500 text-sm w-full md:w-1/2"
                    />
                    <button onClick={() => {
                        const newOpts = [...q.options]; newOpts.splice(oIndex, 1);
                        updateQuestion(qIndex, { options: newOpts })
                    }} className="text-dark-500 hover:text-red-400 p-1">✕</button>
                  </div>
                ))}
                <div className="flex items-center gap-3 mt-2 opacity-60">
                   <div className={`w-4 h-4 border-2 border-dark-500 ${q.type === 'radio' ? 'rounded-full' : 'rounded-sm'}`} />
                   <button 
                     onClick={() => updateQuestion(qIndex, { options: [...(q.options||[]), `Seçenek ${(q.options?.length||0)+1}`] })}
                     className="text-sm font-medium text-dark-300 hover:border-b border-dark-300"
                   >
                     Seçenek Ekle
                   </button>
                </div>
              </div>
            )}

            {/* Diğer Soru Tipleri Placeholder'ları */}
            {q.type === 'text' && (
              <div className="border-b border-dark-700 w-1/2 mt-4 pb-2 text-dark-500 text-sm ml-2">Kısa yanıt metni</div>
            )}
            {q.type === 'textarea' && (
              <div className="border border-dark-700 rounded w-full h-16 mt-4 p-2 text-dark-500 text-sm ml-2 bg-dark-950">Uzun yanıt metni</div>
            )}

            {/* Soru Alt Bar (Zorunlu, Sil) */}
            <div className="flex items-center justify-end gap-4 mt-6 pt-4 border-t border-dark-800">
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-dark-400 font-medium">Gerekli</span>
                <input 
                  type="checkbox" 
                  checked={q.is_required}
                  onChange={e => updateQuestion(qIndex, { is_required: e.target.checked })}
                  className="w-4 h-4 accent-primary-500"
                />
              </label>
              <div className="w-px h-6 bg-dark-700" />
              <button onClick={() => removeQuestion(qIndex)} className="p-2 text-dark-400 hover:text-red-400 transition-colors" title="Soruyu Sil">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            
          </div>
        ))}
      </div>

      <div className="flex justify-center mt-8 gap-4">
        <button onClick={addQuestion} className="btn-lg btn-secondary rounded-full px-6 shadow-card flex items-center gap-2 hover:border-primary-500 hover:text-primary-400">
          <Plus className="w-5 h-5" /> Soru Ekle
        </button>
        <button onClick={addSection} className="btn-lg btn-secondary rounded-full px-6 shadow-card flex items-center gap-2 hover:border-purple-500 hover:text-purple-400">
          <AlignLeft className="w-5 h-5" /> Bölüm Ekle
        </button>
      </div>

    </div>
  )
}
