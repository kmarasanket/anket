import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Building2, ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cookies, generateSessionToken, hashIP } from '../../lib/utils'

export default function PublicSurveyPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  
  const [survey, setSurvey] = useState<any>(null)
  const [tenant, setTenant] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const loadSurvey = async () => {
      // 1. Slug ile anketi bul
      const { data: s } = await supabase.from('surveys').select('*').eq('slug', slug).single()
      
      if (!s) {
        setLoading(false)
        return
      }

      // Aktiflik kontrolü
      if (s.status !== 'active') {
        setSurvey({ ...s, is_closed: true })
        setLoading(false)
        return
      }

      setSurvey(s)

      // 2. Kurum bilgilerini al
      const { data: t } = await supabase.from('tenants').select('name, logo_url').eq('id', s.tenant_id).single()
      setTenant(t)

      // 3. Soruları al
      const { data: q } = await supabase.from('questions').select('*').eq('survey_id', s.id).order('order_index')
      setQuestions(q || [])
      
      setLoading(false)
    }

    if (slug) loadSurvey()
  }, [slug])

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  const handleCheckboxChange = (questionId: string, option: string, checked: boolean) => {
    setAnswers(prev => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] : []
      if (checked) {
        return { ...prev, [questionId]: [...current, option] }
      } else {
        return { ...prev, [questionId]: current.filter((item: string) => item !== option) }
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    
    // Zorunlu alan kontrolü
    const missing = questions.find(q => q.is_required && (!answers[q.id] || answers[q.id].length === 0))
    if (missing) {
      setErrorMsg(`Lütfen zorunlu bir soru olan "${missing.title}" sorusunu yanıtlayın.`)
      // Scroll to the error (basic implementaton)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setSubmitting(true)
    try {
      // Oturum ve IP işlemleri (gerçek ortamda bir API route'u IP'yi alır)
      let sessionToken = cookies.get(`survey_session_${survey.id}`)
      if (!sessionToken) {
        sessionToken = generateSessionToken()
        cookies.set(`survey_session_${survey.id}`, sessionToken, 30) // 30 günlük
      }

      // Güvenlik: IP'yi hashle (örnek olarak sabit veya tarayıcıdan dummy ip)
      const ip = '127.0.0.1' // Gerçek yapıda Vercel Edge'den x-forwarded-for ile alınmalı
      const hashedIp = await hashIP(ip)

      // 1. Yanıt (Response) tablosuna kayıt
      const { data: responseData, error: responseError } = await supabase.from('responses').insert({
        survey_id: survey.id,
        tenant_id: survey.tenant_id,
        session_token: sessionToken,
        ip_hash: hashedIp,
        is_complete: true,
        metadata: { user_agent: navigator.userAgent }
      }).select().single()

      if (responseError) throw responseError

      // 2. Cevapların (Response Answers) kaydedilmesi
      const answersToInsert = Object.entries(answers).map(([question_id, answer]) => ({
        response_id: responseData.id,
        question_id,
        answer: answer
      }))

      if (answersToInsert.length > 0) {
        await supabase.from('response_answers').insert(answersToInsert)
      }

      // Başarılı yönlendirme
      navigate(`/s/${slug}/tesekkurler`)

    } catch (err: any) {
      console.error(err)
      setErrorMsg('Yanıtınız kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
    </div>
  )

  if (!survey) return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="card p-12 max-w-md w-full">
        <h1 className="text-2xl font-bold text-dark-50 mb-2">Anket Bulunamadı</h1>
        <p className="text-dark-400">Aradığınız anket yayından kaldırılmış veya URL hatalı olabilir.</p>
      </div>
    </div>
  )

  if (survey.is_closed) return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="card p-12 max-w-md w-full">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <div className="w-8 h-8 bg-red-500 rounded-full" />
        </div>
        <h1 className="text-2xl font-bold text-dark-50 mb-2">Anket Kapalı</h1>
        <p className="text-dark-400">Bu anket artık yanıt kabul etmiyor. İlginiz için teşekkür ederiz.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-dark-950/50 py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        
        {/* Header / Kurum Logosu */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-dark-900 border border-dark-800 rounded-2xl flex items-center justify-center shadow-card">
            <Building2 className="w-6 h-6 text-primary-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-dark-400 uppercase tracking-wider">{tenant?.name}</p>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-dark-50 leading-tight">
              {survey.title}
            </h1>
          </div>
        </div>

        {/* Hoş Geldiniz Açıklaması */}
        {survey.description && (
          <div className="card p-6 mb-8 border-t-4 border-t-primary-500 bg-dark-900/80">
            <p className="text-dark-200 whitespace-pre-wrap leading-relaxed">
              {survey.description}
            </p>
          </div>
        )}

        {/* Hata Mesajı */}
        {errorMsg && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">
            {errorMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {questions.map((q, index) => (
            <div key={q.id} className="card p-6 sm:p-8 hover:border-dark-700 transition-colors group">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-dark-50 leading-snug">
                  {index + 1}. {q.title}
                  {q.is_required && <span className="text-red-500 ml-1" title="Zorunlu">*</span>}
                </h3>
                {q.description && <p className="text-sm text-dark-400 mt-1">{q.description}</p>}
              </div>

              {/* Soru Tipine Göre Render */}
              <div className="mt-4">
                {q.type === 'text' && (
                  <input
                    type="text"
                    required={q.is_required}
                    value={answers[q.id] || ''}
                    onChange={e => handleAnswerChange(q.id, e.target.value)}
                    className="input w-full md:w-2/3 bg-dark-950 border-dark-800 focus:border-primary-500 focus:bg-dark-900"
                    placeholder="Yanıtınız..."
                  />
                )}

                {q.type === 'textarea' && (
                  <textarea
                    required={q.is_required}
                    value={answers[q.id] || ''}
                    onChange={e => handleAnswerChange(q.id, e.target.value)}
                    className="input w-full bg-dark-950 border-dark-800 focus:border-primary-500 focus:bg-dark-900 resize-y"
                    placeholder="Yanıtınız..."
                    rows={4}
                  />
                )}

                {q.type === 'radio' && (
                  <div className="space-y-3">
                    {q.options?.map((opt: string, i: number) => (
                      <label key={i} className="flex items-center gap-3 p-3 rounded-xl border border-transparent hover:bg-dark-800 cursor-pointer transition-colors has-[:checked]:bg-primary-500/10 has-[:checked]:border-primary-500/30">
                        <input
                          type="radio"
                          name={`q_${q.id}`}
                          value={opt}
                          required={q.is_required && !answers[q.id]}
                          checked={answers[q.id] === opt}
                          onChange={e => handleAnswerChange(q.id, e.target.value)}
                          className="w-4 h-4 text-primary-500 bg-dark-950 border-dark-700 focus:ring-primary-500 focus:ring-offset-dark-900"
                        />
                        <span className="text-dark-200">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'checkbox' && (
                  <div className="space-y-3">
                    {q.options?.map((opt: string, i: number) => (
                      <label key={i} className="flex items-center gap-3 p-3 rounded-xl border border-transparent hover:bg-dark-800 cursor-pointer transition-colors has-[:checked]:bg-primary-500/10 has-[:checked]:border-primary-500/30">
                        <input
                          type="checkbox"
                          value={opt}
                          checked={(answers[q.id] || []).includes(opt)}
                          onChange={e => handleCheckboxChange(q.id, opt, e.target.checked)}
                          className="w-4 h-4 text-primary-500 rounded bg-dark-950 border-dark-700 focus:ring-primary-500 focus:ring-offset-dark-900"
                        />
                        <span className="text-dark-200">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}
                
                {q.type === 'rating' && (
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleAnswerChange(q.id, star)}
                        className={`p-2 rounded-xl border transition-all ${
                          answers[q.id] === star 
                            ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500 scale-110' 
                            : 'bg-dark-950 border-dark-800 text-dark-500 hover:text-yellow-400 hover:border-yellow-400/30'
                        }`}
                      >
                        <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}

                {/* Diğer türler buraya eklenebilir */}
              </div>
            </div>
          ))}

          {/* Gönder Butonu */}
          <div className="pt-6 pb-12 flex items-center justify-between">
            <p className="text-xs text-dark-500 w-2/3">Girdiğiniz veriler anonim olarak işlenmekte ve kişisel verilerin korunması kanununa uygun saklanmaktadır.</p>
            <button type="submit" disabled={submitting} className="btn-lg btn-primary min-w-[160px]">
              {submitting ? 'Gönderiliyor...' : (
                <span className="flex items-center justify-center gap-2">
                  Yanıtı Gönder <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
