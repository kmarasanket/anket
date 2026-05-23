import { useState, useEffect, useMemo } from 'react'
import {
  Trophy, Award, TrendingUp, TrendingDown, Users, ChevronRight, Scale,
  BarChart3, HelpCircle, ArrowRight, Minus, AlertCircle, Sparkles, Building2,
  RefreshCw, Search, ChevronUp, ChevronDown
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

// ── Tipler ──────────────────────────────────────────────────────────────────
interface UnitStats {
  unitName: string
  totalResponses: number
  satisfactionScore: number
  questionBreakdown: { label: string; score: number }[]
}

const getOptionWeight = (opt: string, index: number, totalOptions: number) => {
  const lower = opt.toLowerCase().trim()
  if (lower.includes('çok memnun') || 
      lower.includes('kesinlikle katıl') || 
      lower.includes('tamamen katıl') || 
      lower.includes('çok iyi') ||
      lower === '5' || lower === 'en iyi') return 4;
  if (lower.includes('memnunum') || 
      lower === 'katılıyorum' || 
      lower.includes('iyi') ||
      lower === '4') return 3;
  if (lower.includes('kararsız') || 
      lower === 'orta' || 
      lower.includes('kısmen') ||
      lower === '3') return 2;
  if (lower.includes('memnun değil') || 
      lower === 'katılmıyorum' || 
      lower.includes('kötü') ||
      lower === '2') return 1;
  if (lower.includes('hiç memnun') || 
      lower.includes('kesinlikle katılmı') || 
      lower === 'çok kötü' ||
      lower === '1') return 0;

  if (totalOptions > 1) {
    const isFirstOptionPositive = 
      opt.toLowerCase().includes('memnun') && !opt.toLowerCase().includes('değil') || 
      opt.toLowerCase().includes('katıl') && !opt.toLowerCase().includes('mı') || 
      opt.toLowerCase().includes('iyi');
    
    if (isFirstOptionPositive) {
      return Math.max(0, Math.min(4, Math.round(((totalOptions - 1 - index) / (totalOptions - 1)) * 4)));
    } else {
      return Math.max(0, Math.min(4, Math.round((index / (totalOptions - 1)) * 4)));
    }
  }
  return 0
}

const getAnswerValue = (ansVal: any): string => {
  if (ansVal == null) return '-'
  if (typeof ansVal === 'object' && !Array.isArray(ansVal) && 'value' in ansVal) {
    const v = ansVal.value
    if (v == null || v === '') return '-'
    return Array.isArray(v) ? v.join(', ') : String(v)
  }
  if (Array.isArray(ansVal)) return ansVal.length === 0 ? '-' : ansVal.join(', ')
  return String(ansVal)
}

const stripQuestionPrefix = (title: string): string => {
  return title.replace(/^\d+[-.)\s]+\s*/, '').trim()
}

export default function AdminUnitLeague() {
  const { tenant } = useAuthStore()
  
  // Rapor States
  const [surveys, setSurveys] = useState<any[]>([])
  const [selectedSurveyId, setSelectedSurveyId] = useState('')
  const [loadingSurveys, setLoadingSurveys] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState('')
  
  // Hesaplanan Veriler
  const [hasUnitQuestion, setHasUnitQuestion] = useState(true)
  const [unitQuestionTitle, setUnitQuestionTitle] = useState('')
  const [unitListStats, setUnitListStats] = useState<UnitStats[]>([])
  
  // Arayüz filtreleri
  const [unitA, setUnitA] = useState('')
  const [unitB, setUnitB] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: 'label' | 'scoreA' | 'scoreB' | 'diff'; direction: 'ascending' | 'descending' } | null>(null)

  // 1. Kuruma ait anketleri yükle
  useEffect(() => {
    const loadSurveys = async () => {
      if (!tenant?.id) {
        setLoadingSurveys(false)
        return
      }
      setLoadingSurveys(true)
      setError('')
      try {
        const { data, error: sErr } = await supabase
          .from('surveys')
          .select('id, title')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })

        if (sErr) throw sErr
        setSurveys(data || [])
        if (data && data.length > 0) {
          setSelectedSurveyId(data[0].id)
        }
      } catch (err: any) {
        setError('Anketler yüklenirken hata oluştu: ' + err.message)
      } finally {
        setLoadingSurveys(false)
      }
    }
    loadSurveys()
  }, [tenant?.id])

  // 2. Seçilen anketin birim bazlı verilerini çek ve hesapla
  useEffect(() => {
    const loadUnitData = async () => {
      if (!selectedSurveyId) return
      setLoadingData(true)
      setError('')
      setUnitA('')
      setUnitB('')
      setSearchTerm('')
      setUnitListStats([])
      setHasUnitQuestion(true)

      try {
        // Soruları Çek
        const { data: questionsData, error: qErr } = await supabase
          .from('questions')
          .select('id, title, type, options')
          .eq('survey_id', selectedSurveyId)
          .order('order_index')

        if (qErr) throw qErr
        const questions = questionsData || []

        // Birim/Departman Sorusunu Bul (Daha seçici olalım)
        let unitQ = questions.find(q => {
          if (q.type !== 'radio' && q.type !== 'checkbox') return false
          const t = q.title.toLocaleLowerCase('tr-TR')
          
          const hasKeyword = t.includes('birim') || 
                            t.includes('departman') || 
                            t.includes('görev') || 
                            t.includes('unvan') || 
                            t.includes('rol') || 
                            t.includes('servis') || 
                            t.includes('klinik') ||
                            t.includes('bölüm') ||
                            t.includes('hizmet aldığ')
          
          if (!hasKeyword) return false

          // Seçenekleri Likert ifadeleri içermemeli (Memnuniyet veya Katılım soruları elenir)
          if (q.options && Array.isArray(q.options)) {
            const hasLikertOptions = q.options.some((opt: string) => {
              const o = opt.toLocaleLowerCase('tr-TR')
              return o.includes('katıl') || 
                     o.includes('memnun') || 
                     o.includes('iyi') || 
                     o.includes('kötü') || 
                     o.includes('kararsız') || 
                     o.includes('orta') ||
                     o === 'evet' || 
                     o === 'hayır'
            })
            if (hasLikertOptions) return false
          }
          
          return true
        })

        // Eğer radio/checkbox olarak bulunamadıysa, text tipindeki soruları ara (örneğin Çalıştığınız Bölüm, Yattığı Klinik vb.)
        if (!unitQ) {
          unitQ = questions.find(q => {
            if (q.type !== 'text') return false
            const t = q.title.toLocaleLowerCase('tr-TR')
            
            const hasKeyword = t.includes('birim') || 
                              t.includes('departman') || 
                              t.includes('görev') || 
                              t.includes('unvan') || 
                              t.includes('rol') || 
                              t.includes('servis') || 
                              t.includes('klinik') ||
                              t.includes('bölüm') ||
                              t.includes('hizmet aldığ')
            
            return hasKeyword
          })
        }

        if (!unitQ) {
          setHasUnitQuestion(false)
          setLoadingData(false)
          return
        }

        setUnitQuestionTitle(unitQ.title)

        // Diğer demografik soruları hariç tutalım (Cinsiyet, Yaş vb.)
        const genderQ = questions.find(q => q.title.toLocaleLowerCase('tr-TR').includes('cinsiyet'))
        const ageQ = questions.find(q => q.title.toLocaleLowerCase('tr-TR').includes('yaş'))
        const eduQ = questions.find(q => q.title.toLocaleLowerCase('tr-TR').includes('eğitim') || q.title.toLocaleLowerCase('tr-TR').includes('öğrenim'))

        // Genel memnuniyet hesaplama seçenek setini tespit et (Likert Ölçek)
        const optionCounts: Record<string, { count: number, options: string[] }> = {}
        questions.forEach(q => {
          if (q.id === unitQ.id || q.id === genderQ?.id || q.id === ageQ?.id || q.id === eduQ?.id) return
          if (!q.options || q.options.length < 3) return
          const key = JSON.stringify(q.options)
          if (!optionCounts[key]) optionCounts[key] = { count: 0, options: q.options }
          optionCounts[key].count++
        })

        let mainOptions: string[] = []
        let maxCount = 0
        Object.values(optionCounts).forEach(item => {
          if (item.count > maxCount) {
            maxCount = item.count
            mainOptions = item.options
          }
        })

        // Sadece Likert membran sorularını alalım
        const satisfactionQuestions = questions.filter(q => {
          if (q.id === unitQ.id || q.id === genderQ?.id || q.id === ageQ?.id || q.id === eduQ?.id) return false
          if (!q.options) return false
          return JSON.stringify(q.options) === JSON.stringify(mainOptions)
        })

        const weights: Record<string, number> = {}
        mainOptions.forEach((opt: string, idx: number) => {
          weights[opt] = getOptionWeight(opt, idx, mainOptions.length)
        })

        // Yanıtları Çek
        const { data: responsesData, error: rErr } = await supabase
          .from('responses')
          .select('id, response_answers(question_id, answer)')
          .eq('survey_id', selectedSurveyId)
          .eq('is_complete', true)

        if (rErr) throw rErr
        const responses = responsesData || []

        // Dinamik olarak seçenekleri çıkaralım (text sorusu ise yanıtları tarayarak, radio/checkbox ise q.options kullanarak)
        let unitOptions: string[] = []
        if (unitQ.options && Array.isArray(unitQ.options) && unitQ.options.length > 0) {
          unitOptions = unitQ.options
        } else {
          const uniqueAnswers = new Set<string>()
          responses.forEach((r: any) => {
            const ans = r.response_answers?.find((a: any) => a.question_id === unitQ.id)
            if (ans) {
              const val = getAnswerValue(ans.answer).trim()
              if (val && val !== '-' && val !== '') {
                uniqueAnswers.add(val.toLocaleUpperCase('tr-TR'))
              }
            }
          })
          unitOptions = Array.from(uniqueAnswers).sort()
        }

        if (responses.length === 0 || unitOptions.length === 0) {
          setUnitListStats([])
          setLoadingData(false)
          return
        }

        // Birim bazında gruplayıp skor hesaplama
        const statsMap: Record<string, { responses: any[] }> = {}
        unitOptions.forEach((opt: string) => {
          statsMap[opt] = { responses: [] }
        })

        // Yanıtları birimlerine dağıt
        responses.forEach((r: any) => {
          const uAns = r.response_answers?.find((a: any) => a.question_id === unitQ.id)
          if (uAns) {
            const rawVal = getAnswerValue(uAns.answer).trim()
            if (rawVal && rawVal !== '-' && rawVal !== '') {
              const rawValUpper = rawVal.toLocaleUpperCase('tr-TR')
              const matchedUnit = unitOptions.find((opt: string) => opt.toLocaleUpperCase('tr-TR').trim() === rawValUpper)
              if (matchedUnit) {
                statsMap[matchedUnit].responses.push(r)
              }
            }
          }
        })

        // Her birim için memnuniyet ve soru bazlı skorları hesapla
        const computedStats: UnitStats[] = []

        Object.keys(statsMap).forEach(uName => {
          const uResponses = statsMap[uName].responses
          if (uResponses.length === 0) return

          // Soru bazında skorları çıkar
          const questionBreakdown = satisfactionQuestions.map(q => {
            let totalScore = 0
            let answeredCount = 0

            uResponses.forEach(r => {
              const ans = r.response_answers?.find((a: any) => a.question_id === q.id)
              if (ans) {
                const val = getAnswerValue(ans.answer)
                if (mainOptions.includes(val)) {
                  totalScore += weights[val]
                  answeredCount++
                }
              }
            })

            const score = answeredCount > 0 ? Math.round((totalScore / (answeredCount * 4)) * 100) : 0
            return {
              label: stripQuestionPrefix(q.title),
              score
            }
          })

          // Genel ortalama skor
          const avgScore = questionBreakdown.length > 0
            ? Math.round(questionBreakdown.reduce((acc, q) => acc + q.score, 0) / questionBreakdown.length)
            : 0

          computedStats.push({
            unitName: uName,
            totalResponses: uResponses.length,
            satisfactionScore: avgScore,
            questionBreakdown
          })
        })

        // Skorlarına göre büyükten küçüğe sırala
        computedStats.sort((a, b) => b.satisfactionScore - a.satisfactionScore)
        setUnitListStats(computedStats)

        // Karşılaştırma için varsayılan birimleri seç
        if (computedStats.length >= 2) {
          setUnitA(computedStats[0].unitName)
          setUnitB(computedStats[1].unitName)
        } else if (computedStats.length === 1) {
          setUnitA(computedStats[0].unitName)
        }

      } catch (err: any) {
        setError('Birim verileri analiz edilirken hata oluştu: ' + err.message)
      } finally {
        setLoadingData(false)
      }
    }
    loadUnitData()
  }, [selectedSurveyId])

  // Kupalı En İyi 3 Birim
  const topThree = useMemo(() => {
    return unitListStats.slice(0, 3)
  }, [unitListStats])

  // Lig Geri Kalanı
  const restOfLeague = useMemo(() => {
    return unitListStats.slice(3)
  }, [unitListStats])

  // Birim Çapraz Karşılaştırma Skor Listesi
  const comparedQuestions = useMemo(() => {
    const stats1 = unitListStats.find(u => u.unitName === unitA)
    const stats2 = unitListStats.find(u => u.unitName === unitB)
    if (!stats1 || !stats2) return []

    let result = stats1.questionBreakdown.map((q, idx) => {
      const match = stats2.questionBreakdown.find(x => x.label === q.label)
      const scoreB = match ? match.score : 0
      return {
        originalIdx: idx,
        label: q.label,
        scoreA: q.score,
        scoreB,
        diff: q.score - scoreB
      }
    })

    if (searchTerm) {
      const s = searchTerm.toLowerCase().trim()
      result = result.filter(q => q.label.toLowerCase().includes(s))
    }

    if (sortConfig !== null) {
      result.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1
        }
        return 0
      })
    }

    return result
  }, [unitListStats, unitA, unitB, searchTerm, sortConfig])

  const requestSort = (key: 'label' | 'scoreA' | 'scoreB' | 'diff') => {
    let direction: 'ascending' | 'descending' = 'ascending'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending'
    }
    setSortConfig({ key, direction })
  }

  const selectedSurvey = surveys.find(s => s.id === selectedSurveyId)

  return (
    <div className="animate-in space-y-6">
      
      {/* Üst Başlık */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Trophy className="w-5 h-5 text-white animate-bounce" />
        </div>
        <div>
          <h1 className="page-title">Birim Analiz Ligi & Karşılaştırma</h1>
          <p className="page-subtitle">Kurumunuz içindeki klinik, servis veya birimlerin memnuniyet düzeylerini kıyaslayın ve performans ligini izleyin.</p>
        </div>
      </div>

      {/* Kontrol Seçim Kartı */}
      <div className="card p-6 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider block">Değerlendirilecek Anket Seçin</label>
          <select
            value={selectedSurveyId}
            onChange={e => setSelectedSurveyId(e.target.value)}
            disabled={loadingSurveys}
            className="input w-full bg-dark-900 border-dark-800 text-dark-100 h-11"
          >
            {loadingSurveys ? (
              <option>Anketler Yükleniyor...</option>
            ) : surveys.length === 0 ? (
              <option>Anket Bulunamadı</option>
            ) : (
              surveys.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))
            )}
          </select>
        </div>
        {selectedSurvey && (
          <div className="text-xs text-dark-400 italic py-3 bg-dark-900/40 px-4 rounded-xl border border-dark-800/50 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Seçilen Anket: <strong>{selectedSurvey.title}</strong></span>
          </div>
        )}
      </div>

      {/* Yükleniyor */}
      {loadingData && (
        <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm text-dark-400">Kurum içi servis verileri analiz ediliyor, lütfen bekleyin...</p>
        </div>
      )}

      {/* Hata Durumu */}
      {error && (
        <div className="card p-4 bg-red-500/5 border-red-500/20 text-red-300 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* ⚠️ Boş Durum: Birim Sorusu Bulunamazsa */}
      {!loadingData && !hasUnitQuestion && (
        <div className="card p-12 text-center max-w-2xl mx-auto flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 text-amber-400">
            <HelpCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-dark-100">Birim Sorusu Tespit Edilemedi</h3>
            <p className="text-sm text-dark-400 mt-2 leading-relaxed">
              Bu ekranın çalışabilmesi için seçilen ankette katılımcının hizmet aldığı **servis, klinik veya departmanı** seçebileceği bir soru bulunmalıdır.
            </p>
            <p className="text-xs text-dark-500 mt-3 bg-dark-900 p-3 rounded-lg border border-dark-800 max-w-lg mx-auto">
              Sistem; başlığında **"birim", "servis", "departman", "klinik", "görev"** veya **"unvan"** geçen çoktan seçmeli (radio/checkbox) soruları otomatik olarak tarayıp gruplar.
            </p>
          </div>
        </div>
      )}

      {/* ⚠️ Boş Durum: Veri yoksa */}
      {!loadingData && hasUnitQuestion && unitListStats.length === 0 && selectedSurveyId && (
        <div className="card p-16 text-center flex flex-col items-center gap-4 border-dashed border-dark-800">
          <Users className="w-12 h-12 text-dark-700 animate-pulse" />
          <div>
            <h3 className="text-dark-200 font-semibold">Henüz Yanıt Verisi Yok</h3>
            <p className="text-dark-500 text-sm mt-1 max-w-sm">Bu anket için henüz tamamlanmış katılımcı kaydı bulunmuyor. Yanıtlar toplanmaya başladığında sıralama ligi aktif olacaktır.</p>
          </div>
        </div>
      )}

      {/* ✅ Veriler Hazırsa */}
      {!loadingData && hasUnitQuestion && unitListStats.length > 0 && (
        <div className="space-y-8 animate-in">
          
          {/* 1. LİG KÜRSÜSÜ (TOP 3) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-4">
            
            {/* 2. SIRA (Gümüş) */}
            {topThree[1] && (
              <div className="card p-6 flex flex-col items-center gap-3 border-t-2 border-t-slate-400 bg-gradient-to-b from-dark-900/60 to-dark-950 order-2 md:order-1 h-[240px] justify-between relative overflow-hidden group hover:border-slate-300 transition-all">
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-slate-500/10 border border-slate-400/20 text-slate-300 rounded text-[9px] font-bold">Gümüş Kürsü</div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 bg-slate-500/10 rounded-2xl flex items-center justify-center border border-slate-400/20 text-slate-300 shadow shadow-slate-500/20">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-dark-300 font-bold text-center leading-tight line-clamp-2 px-2">{topThree[1].unitName}</p>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-black text-slate-300 font-display">%{topThree[1].satisfactionScore}</span>
                  <span className="text-[10px] text-dark-500 mt-1">{topThree[1].totalResponses} Katılım</span>
                </div>
              </div>
            )}

            {/* 1. SIRA (Altın - Lider) */}
            {topThree[0] && (
              <div className="card p-6 flex flex-col items-center gap-4 border-t-4 border-t-amber-500 bg-gradient-to-b from-amber-500/5 to-dark-950 order-1 md:order-2 h-[270px] justify-between relative overflow-hidden group hover:border-amber-400 transition-all shadow-lg shadow-amber-500/5">
                <div className="absolute top-2 right-2 px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded text-[9px] font-bold flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 animate-pulse" /> Şampiyon
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-amber-500/10 rounded-3xl flex items-center justify-center border border-amber-500/20 text-amber-400 shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform duration-500">
                    <Trophy className="w-8 h-8" />
                  </div>
                  <p className="text-sm text-amber-200 font-black text-center leading-snug line-clamp-2 px-2">{topThree[0].unitName}</p>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-4xl font-black text-amber-300 font-display">%{topThree[0].satisfactionScore}</span>
                  <span className="text-[10px] text-dark-400 mt-1 font-semibold">{topThree[0].totalResponses} Katılımcı</span>
                </div>
              </div>
            )}

            {/* 3. SIRA (Bronz) */}
            {topThree[2] && (
              <div className="card p-6 flex flex-col items-center gap-3 border-t-2 border-t-amber-700 bg-gradient-to-b from-dark-900/60 to-dark-950 order-3 md:order-3 h-[220px] justify-between relative overflow-hidden group hover:border-amber-600 transition-all">
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-amber-700/10 border border-amber-700/20 text-amber-500 rounded text-[9px] font-bold">Bronz Kürsü</div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 bg-amber-700/10 rounded-2xl flex items-center justify-center border border-amber-700/20 text-amber-600 shadow shadow-amber-700/20">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-dark-300 font-bold text-center leading-tight line-clamp-2 px-2">{topThree[2].unitName}</p>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-black text-amber-600 font-display">%{topThree[2].satisfactionScore}</span>
                  <span className="text-[10px] text-dark-500 mt-1">{topThree[2].totalResponses} Katılım</span>
                </div>
              </div>
            )}

          </div>

          {/* 2. LİG TABLOSU (GERİ KALAN BİRİMLER) */}
          {restOfLeague.length > 0 && (
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-dark-800 bg-dark-900/20">
                <h3 className="text-xs font-bold text-dark-300 uppercase tracking-wider">Lig Sıralaması</h3>
              </div>
              <div className="divide-y divide-dark-850">
                {restOfLeague.map((unit, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between gap-4 hover:bg-dark-900/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-dark-500 w-5">{idx + 4}</span>
                      <p className="text-xs font-bold text-dark-200">{unit.unitName}</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="text-[10px] text-dark-500 font-semibold">{unit.totalResponses} Katılım</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-extrabold text-indigo-300 font-display">%{unit.satisfactionScore}</span>
                        <div className="w-20 h-2 bg-dark-950 rounded-full overflow-hidden border border-dark-800">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${unit.satisfactionScore}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. BİRİMLER ARASI ÇAPRAZ KIYASLAMA EKRANI */}
          {unitListStats.length >= 2 && (
            <div className="card p-6 space-y-6">
              
              <div className="flex items-center gap-2 border-b border-dark-800 pb-3">
                <Scale className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-dark-100 uppercase tracking-wider">Birimler Arası Detaylı Kıyaslama</h3>
              </div>

              {/* Birim Seçiciler */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Birim A */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-semibold text-dark-300">
                    <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block shadow shadow-indigo-500/20" />
                    Birim A Seçin
                  </label>
                  <select
                    value={unitA}
                    onChange={e => setUnitA(e.target.value)}
                    className="input w-full bg-dark-950 border-indigo-500/30 focus:border-indigo-500 text-sm h-11"
                  >
                    {unitListStats.map(u => (
                      <option key={u.unitName} value={u.unitName} disabled={u.unitName === unitB}>{u.unitName}</option>
                    ))}
                  </select>
                </div>

                {/* Birim B */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-semibold text-dark-300">
                    <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow shadow-amber-500/20" />
                    Birim B Seçin
                  </label>
                  <select
                    value={unitB}
                    onChange={e => setUnitB(e.target.value)}
                    className="input w-full bg-dark-950 border-amber-500/30 focus:border-amber-500 text-sm h-11"
                  >
                    {unitListStats.map(u => (
                      <option key={u.unitName} value={u.unitName} disabled={u.unitName === unitA}>{u.unitName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Arama ve Kıyaslama Tablosu */}
              {unitA && unitB && unitA !== unitB && (
                <div className="border border-dark-800 rounded-2xl overflow-hidden mt-4">
                  <div className="p-4 border-b border-dark-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-dark-900/10">
                    <p className="text-xs text-dark-400 font-semibold">
                      <strong>{unitA}</strong> ile <strong>{unitB}</strong> arasındaki soru düzeyi memnuniyet farkları.
                    </p>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-dark-500" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Sorularda ara..."
                        className="input w-full bg-dark-950 border-dark-800 focus:border-indigo-500 text-xs pl-9 h-9"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-dark-900 border-b border-dark-800 text-dark-400 text-xs font-semibold">
                        <tr>
                          <th onClick={() => requestSort('label')} className="px-6 py-4 cursor-pointer select-none hover:text-white transition-colors w-7/12">
                            <div className="flex items-center gap-1.5">
                              Anket Soru Maddesi
                              {sortConfig?.key === 'label' && (sortConfig.direction === 'ascending' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => requestSort('scoreA')} className="px-6 py-4 cursor-pointer select-none hover:text-white text-center transition-colors w-2/12">
                            <div className="flex items-center justify-center gap-1.5">
                              {unitA}
                              {sortConfig?.key === 'scoreA' && (sortConfig.direction === 'ascending' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => requestSort('scoreB')} className="px-6 py-4 cursor-pointer select-none hover:text-white text-center transition-colors w-2/12">
                            <div className="flex items-center justify-center gap-1.5">
                              {unitB}
                              {sortConfig?.key === 'scoreB' && (sortConfig.direction === 'ascending' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => requestSort('diff')} className="px-6 py-4 cursor-pointer select-none hover:text-white text-center transition-colors w-2/12">
                            <div className="flex items-center justify-center gap-1.5">
                              Skor Farkı (A - B)
                              {sortConfig?.key === 'diff' && (sortConfig.direction === 'ascending' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-850">
                        {comparedQuestions.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-xs text-dark-500 italic">
                              Eşleşen veya arama kriterine uygun bir soru maddesi bulunamadı.
                            </td>
                          </tr>
                        ) : (
                          comparedQuestions.map((q, idx) => {
                            const diffText = `${q.diff > 0 ? '+' : ''}${q.diff} Puan`
                            const diffColor = q.diff > 0 
                              ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/10' 
                              : q.diff < 0 
                                ? 'text-amber-400 bg-amber-500/10 border border-amber-500/10' 
                                : 'text-dark-400 bg-dark-800'

                            return (
                              <tr key={idx} className="hover:bg-dark-900/30 transition-colors table-row">
                                <td className="px-6 py-3.5 text-dark-200">
                                  <div className="font-semibold text-xs leading-relaxed max-w-xl">
                                    {q.originalIdx + 1}. {q.label}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5 text-center font-bold text-indigo-300">
                                  %{q.scoreA}
                                </td>
                                <td className="px-6 py-3.5 text-center font-bold text-amber-300">
                                  %{q.scoreB}
                                </td>
                                <td className="px-6 py-3.5 text-center">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-lg ${diffColor}`}>
                                    {q.diff > 0 && <TrendingUp className="w-3.5 h-3.5" />}
                                    {q.diff < 0 && <TrendingDown className="w-3.5 h-3.5" />}
                                    {diffText}
                                  </span>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
