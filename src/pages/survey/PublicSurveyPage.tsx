import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Building2, ArrowRight, Pause, RefreshCw } from 'lucide-react'
import { httpFrom } from '../../lib/supabaseHttp'
import { cookies, generateSessionToken, hashIP, generateUUID } from '../../lib/utils'
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
  const [refreshing, setRefreshing] = useState(false)
  
  const [currentPage, setCurrentPage] = useState(0)
  
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [kvkkConsent, setKvkkConsent] = useState(false)
  const [missingId, setMissingId] = useState<string | null>(null)

  const loadSurvey = async (showLoadingState = true) => {
    if (showLoadingState) setLoading(true)
    try {
      // 1. Önce anketi ve kurumu tek seferde al (slug ile)
      const qSurvey = httpFrom('surveys').select('*, tenants(name,logo_url)')
      qSurvey.ilike('slug', slug!)
      const { data: s, error: sErr } = await qSurvey.single().execute()

      if (sErr || !s) { 
        setErrorMsg(sErr ? sErr.message : `Slug eşleşmedi: ${slug}`)
        if (showLoadingState) setLoading(false) 
        return 
      }

      // Kurum bilgisini her zaman set et (kapalı olsa bile logo ve isim gösterimi için)
      setTenant(s.tenants || null)

      if (s.status !== 'active') {
        setSurvey({ ...s, is_closed: true })
        if (showLoadingState) setLoading(false)
        return
      }

      setSurvey(s)

      // 2. Soruları çek
      const qQ = httpFrom('questions').select('*')
      qQ.eq('survey_id', s.id)
      qQ.order('order_index', { ascending: true })

      const { data: questionsData } = await qQ.execute()
      setQuestions(questionsData || [])
    } catch (err: any) {
      addNotification('Anket yüklenirken bir hata oluştu.', 'error')
    } finally {
      if (showLoadingState) setLoading(false)
    }
  }

  useEffect(() => {
    if (slug) loadSurvey(true)
  }, [slug])

  const handleRetry = async () => {
    setRefreshing(true)
    await loadSurvey(false)
    await new Promise(resolve => setTimeout(resolve, 800)) // visual feedback
    setRefreshing(false)
  }

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

  // Sayfa değişince en üste kaydır
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [currentPage])

  // Zorunlu soru kontrolu: eksik soruyu bul, vurgula ve scroll et
  const validatePage = (qs: any[]): boolean => {
    const missing = qs.find(q =>
      q.is_required &&
      q.type !== 'section' &&
      (answers[q.id] == null || answers[q.id] === '' ||
        (Array.isArray(answers[q.id]) && answers[q.id].length === 0))
    )
    if (missing) {
      setMissingId(missing.id)
      setErrorMsg(`Lütfen "${missing.title}" sorusunu yanıtlayın.`)
      // Eksik soruya scroll et
      setTimeout(() => {
        const el = document.getElementById(`question-${missing.id}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return false
    }
    setMissingId(null)
    setErrorMsg('')
    return true
  }

  const handleNext = () => {
    if (!validatePage(currentQuestions)) return
    setCurrentPage(p => p + 1)
  }

  const handlePrev = () => {
    setErrorMsg('')
    setCurrentPage(p => p - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
    if (missingId === questionId) setMissingId(null) // Hata vurgulamasini kaldir
  }

  const handleCheckboxChange = (questionId: string, option: string, checked: boolean) => {
    setAnswers(prev => {
      const current = (prev[questionId] as string[]) || []
      const updated = checked 
        ? [...current, option]
        : current.filter(o => o !== option)
      
      if (missingId === questionId) setMissingId(null)
      return { ...prev, [questionId]: updated }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLastPage) {
        handleNext()
        return
    }

    setErrorMsg('')

    // Son sayfa validasyonu
    if (!validatePage(currentQuestions)) return

    // KVKK onayı zorunlu
    if (!kvkkConsent) {
      setErrorMsg('Devam edebilmek için lütfen KVKK aydınlatma metnini onaylayın.')
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
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

      // ÖNEMLİ: RLS Select yetkisi olmayan public sayfalarda 'returnData' (return=representation) 
      // bazen boş dönebilir ([]). Bu yüzden ID'yi client tarafında üretip gönderiyoruz.
      const responseId = generateUUID()

      // Yanıtı kaydet - metadata minimum tutulur (depolama tasarrufu)
      const ua = navigator.userAgent
      const browser = ua.includes('Chrome') ? 'ch' : ua.includes('Firefox') ? 'ff' : ua.includes('Safari') ? 'sf' : ua.includes('Edge') ? 'ed' : 'ot'
      const isMobile = /Mobi|Android/i.test(ua) ? 1 : 0

      const { error: responseError } = await httpFrom('responses').insert({
        id: responseId, // Client tarafından üretilen ID
        survey_id: survey.id,
        tenant_id: survey.tenant_id,
        session_token: sessionToken,
        ip_hash: hashedIp,
        is_complete: true,
        completed_at: new Date().toISOString(),
        metadata: { b: browser, m: isMobile }
      })

      if (responseError) throw responseError

      // Cevapları hazırla
      const answersToInsert = Object.entries(answers).map(([question_id, answer]) => ({
        response_id: responseId,
        question_id,
        answer: answer  // Düz değer saklanır
      }))

      if (answersToInsert.length > 0) {
        const { error: ansErr } = await httpFrom('response_answers').insert(answersToInsert)
        if (ansErr) throw ansErr
      }

      addNotification('Anket başarıyla gönderildi.', 'success')
      navigate(`/s/${slug}/tesekkurler`)

    } catch (err: any) {
      console.error('Anket gönderim hatası:', err)
      const errorDetail = err.message || 'Bilinmeyen hata'
      addNotification(`Yanıtınız kaydedilirken bir hata oluştu: ${errorDetail}. Lütfen tekrar deneyin.`, 'error')
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
        {errorMsg && <p className="text-red-400 text-xs mt-6 opacity-30 font-mono">Hata Detayı: {errorMsg}</p>}
      </div>
    </div>
  )

  if (survey.is_closed) return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
      {/* Background ambient glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary-500/5 rounded-full blur-[100px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />
      
      <div className="max-w-md w-full relative z-10">
        {/* Tenant Logo and Name (Header) */}
        {tenant && (
          <div className="flex flex-col items-center mb-6 animate-fade-in">
            {tenant.logo_url ? (
              <img 
                src={tenant.logo_url} 
                alt={tenant.name} 
                className="h-16 w-auto object-contain mb-3 drop-shadow-glow" 
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            ) : (
              <div className="w-10 h-10 bg-dark-900 border border-dark-800 rounded-xl flex items-center justify-center shadow-card mb-2">
                <Building2 className="w-5 h-5 text-primary-400" />
              </div>
            )}
            <p className="text-xs font-semibold text-dark-400 uppercase tracking-widest">
              {tenant.name}
            </p>
          </div>
        )}

        {/* Card */}
        <div 
          className="card p-8 sm:p-10 border border-dark-800/80 bg-dark-900/40 backdrop-blur-xl relative shadow-[0_0_50px_rgba(0,0,0,0.4)] transition-all hover:border-dark-700/80 group"
          style={{ animation: 'modalIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
        >
          {/* Top dynamic ambient accent bar */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/50 via-primary-500/50 to-amber-500/50 rounded-t-2xl opacity-70" />

          {/* Pulsing pause icon container */}
          <div className="w-20 h-20 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.15)] relative group-hover:scale-105 transition-transform duration-300">
            <div className="absolute inset-0 rounded-2xl bg-amber-500/5 animate-ping opacity-75 pointer-events-none" />
            <Pause className="w-10 h-10 text-amber-500 relative z-10" />
          </div>
          
          <h2 className="text-xl sm:text-2xl font-bold text-dark-50 mb-2 tracking-tight">
            Anket Geçici Olarak Durduruldu
          </h2>
          
          {survey.title && (
            <p className="text-xs font-medium text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded-lg py-1.5 px-3 inline-block mb-4 max-w-full truncate">
              {survey.title}
            </p>
          )}

          <p className="text-dark-300 leading-relaxed text-sm sm:text-base mb-8">
            Bu anket yöneticiler tarafından geçici olarak yeni katılımlara kapatılmıştır.
            Lütfen daha sonra tekrar deneyiniz. Gösterdiğiniz ilgi için teşekkür ederiz.
          </p>

          {/* Yeniden Dene Button */}
          <button
            onClick={handleRetry}
            disabled={refreshing}
            className="w-full btn-lg bg-gradient-to-r from-dark-800 to-dark-900 hover:from-dark-700 hover:to-dark-800 text-dark-100 border border-dark-700 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2.5 font-bold hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-primary-400 ${refreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            {refreshing ? 'Kontrol Ediliyor...' : 'Yeniden Dene'}
          </button>
        </div>
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
            <p className="text-sm sm:text-base font-semibold text-dark-300 uppercase tracking-widest mb-1">
              {tenant?.name}
            </p>
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
                    <span>%{Math.round((currentPage / pages.length) * 100)} Tamamlandı</span>
                </div>
                <div className="h-1.5 w-full bg-dark-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-primary-500 transition-all duration-500 ease-out"
                        style={{ width: `${(currentPage / pages.length) * 100}%` }}
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
              <div
                key={q.id}
                id={`question-${q.id}`}
                className={`card p-6 sm:p-8 transition-colors group ${
                  missingId === q.id
                    ? 'border-red-500/60 bg-red-500/5 shadow-[0_0_0_2px_rgba(239,68,68,0.3)]'
                    : 'hover:border-dark-700'
                }`}
              >
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

                  {(q.type === 'radio' || q.type === 'checkbox') && (
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

          {/* KVKK Onay Kutusu - Sadece Son Sayfada */}
          {isLastPage && (
            <div className="mt-6 p-5 rounded-2xl border border-primary-500/20 bg-primary-500/5">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    id="kvkk-consent"
                    checked={kvkkConsent}
                    onChange={e => setKvkkConsent(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    kvkkConsent
                      ? 'bg-primary-500 border-primary-500'
                      : 'border-dark-500 bg-dark-900 group-hover:border-primary-400'
                  }`}>
                    {kvkkConsent && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-dark-300 leading-relaxed">
                  <span className="font-semibold text-dark-100">KVKK Aydınlatma Metni: </span>
                  Bu ankette verdiğim bilgilerin, kurumsal hizmet kalitesinin iyileştirilmesi amacıyla{' '}
                  <span className="text-primary-400 font-medium">anonim olarak</span>{' '}
                  işlenmesini ve değerlendirilmesini onaylıyorum. Kişisel verilerim üçüncü şahıslarla paylaşılmayacaktır.
                </span>
              </label>
            </div>
          )}

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
                        disabled={submitting || !kvkkConsent} 
                        className={`btn-lg flex-1 sm:flex-none min-w-[160px] transition-all ${
                          kvkkConsent ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed'
                        }`}
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
