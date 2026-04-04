import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Building2, ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cookies, generateSessionToken, hashIP } from '../../lib/utils'
import { useNotificationStore } from '../../stores/notificationStore'

export default function PublicSurveyPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { addNotification } = useNotificationStore()
  
  const [survey, setSurvey] = useState<any>(null)
  const [tenant, setTenant] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  const [currentPage, setCurrentPage] = useState(0)
  
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const loadSurvey = async () => {
      setLoading(true)
      try {
        const { data: s, error: sErr } = await supabase.from('surveys').select('*').eq('slug', slug).single()
        
        if (sErr || !s) {
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
      } catch (err: any) {
        addNotification('Anket yüklenirken bir hata oluştu.', 'error')
      } finally {
        setLoading(false)
      }
    }

    if (slug) loadSurvey()
  }, [slug, addNotification])

  // Split questions into pages based on 'section' type
  const getPages = () => {
    const pages: any[][] = []
    let currentPageQuestions: any[] = []

    questions.forEach((q) => {
      if (q.type === 'section' && currentPageQuestions.length > 0) {
        pages.push(currentPageQuestions)
        currentPageQuestions = [q]
      } else if (q.type === 'section') {
        currentPageQuestions = [q]
      } else {
        currentPageQuestions.push(q)
      }
    })

    if (currentPageQuestions.length > 0) {
      pages.push(currentPageQuestions)
    }

    return pages.length > 0 ? pages : [[]]
  }

  const pages = getPages()
  const currentQuestions = pages[currentPage] || []
  const isFirstPage = currentPage === 0
  const isLastPage = currentPage === pages.length - 1

  const handleNext = () => {
    // Current page validation
    const missing = currentQuestions.find(q => q.is_required && q.type !== 'section' && (!answers[q.id] || (Array.isArray(answers[q.id]) && answers[q.id].length === 0)))
    if (missing) {
      setErrorMsg(`Lütfen "${missing.title}" sorusunu yanıtlayın.`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setErrorMsg('')
    setCurrentPage(p => p + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePrev = () => {
    setErrorMsg('')
    setCurrentPage(p => p - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
    if (!isLastPage) {
        handleNext()
        return
    }

    setErrorMsg('')
    
    // Final validation for the last page
    const missing = currentQuestions.find(q => q.is_required && q.type !== 'section' && (!answers[q.id] || (Array.isArray(answers[q.id]) && answers[q.id].length === 0)))
    if (missing) {
      setErrorMsg(`Lütfen "${missing.title}" sorusunu yanıtlayın.`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setSubmitting(true)
    try {
      let sessionToken = cookies.get(`survey_session_${survey.id}`)
      if (!sessionToken) {
        sessionToken = generateSessionToken()
        cookies.set(`survey_session_${survey.id}`, sessionToken, 30)
      }

      const ip = '127.0.0.1' 
      const hashedIp = await hashIP(ip)

      const { data: responseData, error: responseError } = await supabase.from('responses').insert({
        survey_id: survey.id,
        tenant_id: survey.tenant_id,
        session_token: sessionToken,
        ip_hash: hashedIp,
        is_complete: true,
        metadata: { user_agent: navigator.userAgent }
      }).select().single()

      if (responseError) throw responseError

      const answersToInsert = Object.entries(answers).map(([question_id, answer]) => ({
        response_id: responseData.id,
        question_id,
        answer: { value: answer } // Structured for the JSONB column
      }))

      if (answersToInsert.length > 0) {
        await supabase.from('response_answers').insert(answersToInsert)
      }

      addNotification('Anket başarıyla gönderildi.', 'success')
      navigate(`/s/${slug}/tesekkurler`)

    } catch (err: any) {
      console.error(err)
      addNotification('Yanıtınız kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.', 'error')
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
        <div className="flex flex-col items-center mb-10 text-center">
          {tenant?.logo_url && (
            <img 
              src={tenant.logo_url} 
              alt="Kurum Logosu" 
              className="h-20 w-auto object-contain mb-6 drop-shadow-glow" 
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
          <div className="flex flex-col items-center gap-2">
            {!tenant?.logo_url && (
                <div className="w-12 h-12 bg-dark-900 border border-dark-800 rounded-2xl flex items-center justify-center shadow-card mb-2">
                  <Building2 className="w-6 h-6 text-primary-400" />
                </div>
            )}
            <p className="text-xs font-semibold text-dark-400 uppercase tracking-widest">{tenant?.name}</p>
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-dark-50 leading-tight">
              {survey.title}
            </h1>
          </div>
        </div>

        {/* İlerleme Çubuğu */}
        {pages.length > 1 && (
            <div className="mb-8 space-y-2">
                <div className="flex justify-between text-xs text-dark-400 font-medium">
                    <span>Bölüm {currentPage + 1} / {pages.length}</span>
                    <span>%{Math.round(((currentPage + 1) / pages.length) * 100)} Tamamlandı</span>
                </div>
                <div className="h-1.5 w-full bg-dark-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-primary-500 transition-all duration-500 ease-out"
                        style={{ width: `${((currentPage + 1) / pages.length) * 100}%` }}
                    />
                </div>
            </div>
        )}

        {/* Hoş Geldiniz Açıklaması (Sadece ilk sayfa) */}
        {isFirstPage && survey.description && (
          <div className="card p-6 mb-8 border-t-4 border-t-primary-500 bg-dark-900/80">
            <p className="text-dark-200 whitespace-pre-wrap leading-relaxed">
              {survey.description}
            </p>
          </div>
        )}

        {/* Hata Mesajı */}
        {errorMsg && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-100 rounded-xl animate-shake">
            {errorMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {currentQuestions.map((q, index) => {
            if (q.type === 'section') {
                return (
                    <div key={q.id} className="pt-4 pb-2 border-b border-dark-800 mb-6">
                        <h2 className="text-2xl font-bold text-primary-400 mb-1">{q.title}</h2>
                        {q.description && <p className="text-dark-400">{q.description}</p>}
                    </div>
                )
            }

            return (
              <div key={q.id} className="card p-6 sm:p-8 hover:border-dark-700 transition-colors group">
                <div className="mb-4">
                  <h3 className="text-lg font-medium text-dark-50 leading-snug">
                    {q.title}
                    {q.is_required && <span className="text-red-500 ml-1" title="Zorunlu">*</span>}
                  </h3>
                  {q.description && <p className="text-sm text-dark-400 mt-1">{q.description}</p>}
                </div>

                <div className="mt-4">
                  {q.type === 'text' && (
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={e => handleAnswerChange(q.id, e.target.value)}
                      className="input w-full md:w-2/3 bg-dark-950 border-dark-800 focus:border-primary-500 focus:bg-dark-900"
                      placeholder="Yanıtınız..."
                    />
                  )}

                  {q.type === 'textarea' && (
                    <textarea
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
                       {Array.from({length: 5}, (_, i) => i + 1).map((star) => (
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
                </div>
              </div>
            )
          })}

          {/* Navigasyon Butonları */}
          <div className="pt-6 pb-12 flex items-center justify-between gap-4">
            <div className="hidden sm:block">
                {!isLastPage ? (
                    <p className="text-xs text-dark-500">Mevcut bölümdeki zorunlu soruları doldurup devam edin.</p>
                ) : (
                    <p className="text-xs text-dark-500">Yanıtlarınız KVKK standartlarına uygun olarak işlenmektedir.</p>
                )}
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
                {!isFirstPage && (
                    <button 
                        type="button" 
                        onClick={handlePrev} 
                        className="btn-lg btn-secondary flex-1 sm:flex-none"
                    >
                        Geri
                    </button>
                )}
                
                {!isLastPage ? (
                    <button 
                        type="button" 
                        onClick={handleNext} 
                        className="btn-lg btn-primary flex-1 sm:flex-none"
                    >
                        Sonraki
                    </button>
                ) : (
                    <button 
                        type="submit" 
                        disabled={submitting} 
                        className="btn-lg btn-primary flex-1 sm:flex-none min-w-[160px]"
                    >
                        {submitting ? 'Gönderiliyor...' : (
                            <span className="flex items-center justify-center gap-2">
                                Gönder <ArrowRight className="w-4 h-4" />
                            </span>
                        )}
                    </button>
                )}
            </div>
          </div>

        </form>
      </div>
    </div>
  )
}
