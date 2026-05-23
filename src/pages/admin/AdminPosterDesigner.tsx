import { useState, useEffect, useRef } from 'react'
import {
  Palette, Sparkles, Building2, Download, RefreshCw, Layout, Type,
  Check, Phone, Globe, QrCode, AlertCircle, Compass, Printer
} from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import html2pdf from 'html2pdf.js'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

// ── Şablon Tanımları ────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 'clinical', label: 'Kurumsal Temiz (Teal)', desc: 'Hastalar için ferah, klinik ve profesyonel tasarım' },
  { id: 'modern',   label: 'Modern Geometrik (Indigo)', desc: 'Şık, teknolojik ve keskin çizgiler' },
  { id: 'warm',     label: 'Hasta Dostu (Emerald)', desc: 'Sıcak, empatik ve yüksek katılım teşvik edici' },
  { id: 'staff',    label: 'Çalışan Geri Bildirim (Amber)', desc: 'Personel anketlerine özel enerjik yapı' },
]

// ── Renk Şemaları ────────────────────────────────────────────────────────────
const PALETTES = [
  { id: 'teal',    label: 'Medikal Teal',   primary: '#0f766e', light: '#0d9488', bgGrad: 'from-teal-600 to-emerald-500' },
  { id: 'indigo',  label: 'Prestij İndigo', primary: '#4f46e5', light: '#6366f1', bgGrad: 'from-indigo-600 to-purple-600' },
  { id: 'emerald', label: 'Doğa Emerald',   primary: '#059669', light: '#10b981', bgGrad: 'from-emerald-600 to-green-500' },
  { id: 'amber',   label: 'Enerjik Amber',  primary: '#d97706', light: '#f59e0b', bgGrad: 'from-amber-600 to-orange-500' },
  { id: 'rose',    label: 'Zarif Rose',     primary: '#e11d48', light: '#f43f5e', bgGrad: 'from-rose-600 to-pink-500' },
]

// ── Slogan Önerileri ──────────────────────────────────────────────────────────
const SLOGANS = [
  "Görüşleriniz Bizim İçin Değerlidir",
  "Hizmetlerimizi Birlikte Geliştirelim",
  "Geri Bildiriminizle Fark Yaratın",
  "Daha İyi Bir Sağlık Hizmeti İçin Bize Yazın",
  "Görüş ve Önerileriniz Geleceğimize Işık Tutuyor",
]

export default function AdminPosterDesigner() {
  const { tenant } = useAuthStore()
  const posterRef = useRef<HTMLDivElement>(null)

  // Rapor / Anket States
  const [surveys, setSurveys] = useState<any[]>([])
  const [selectedSurveyId, setSelectedSurveyId] = useState('')
  const [loadingSurveys, setLoadingSurveys] = useState(true)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  // Tasarım States
  const [slogan, setSlogan] = useState(SLOGANS[0])
  const [subText, setSubText] = useState("Hizmet kalitemizi artırmak ve sizlere daha iyi bir deneyim sunabilmek amacıyla hazırladığımız kısa anketimize QR kodu okutarak katılabilirsiniz.")
  const [template, setTemplate] = useState('clinical')
  const [paletteId, setPaletteId] = useState('teal')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait') // portrait A4, landscape A5
  const [showPhone, setShowPhone] = useState(true)
  const [showWeb, setShowWeb] = useState(true)
  const [footerText, setFooterText] = useState("T.C. Sağlık Bakanlığı · Kahramanmaraş İl Sağlık Müdürlüğü")

  // 1. Kuruma ait anketleri yükle
  useEffect(() => {
    const loadSurveys = async () => {
      if (!tenant?.id) return
      setLoadingSurveys(true)
      try {
        const { data, error: sErr } = await supabase
          .from('surveys')
          .select('id, title, slug')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })

        if (sErr) throw sErr
        setSurveys(data || [])
        if (data && data.length > 0) {
          setSelectedSurveyId(data[0].id)
        }
      } catch (err: any) {
        setError('Aktif anketler yüklenirken hata oluştu: ' + err.message)
      } finally {
        setLoadingSurveys(false)
      }
    }
    loadSurveys()
  }, [tenant])

  const selectedSurvey = surveys.find(s => s.id === selectedSurveyId)
  const selectedPalette = PALETTES.find(p => p.id === paletteId) || PALETTES[0]

  // Katılım Linki Oluştur
  const surveyUrl = selectedSurvey 
    ? `${window.location.origin}/s/${selectedSurvey.slug}`
    : `${window.location.origin}`

  // PDF Olarak İndir
  const handleDownloadPDF = async () => {
    const element = posterRef.current
    if (!element) return

    setGenerating(true)
    
    // Yönelime göre PDF sayfa düzeni
    const isPortrait = orientation === 'portrait'
    
    const opt = {
      margin:       0,
      filename:     `Anket_Afisi_${selectedSurvey?.title || 'Birim'}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { 
        scale: 3, // Net baskı kalitesi için çözünürlüğü artırıyoruz
        useCORS: true, 
        letterRendering: true,
        logging: false
      },
      jsPDF:        { 
        unit: 'mm', 
        format: isPortrait ? 'a4' : 'a5', 
        orientation: isPortrait ? 'portrait' : 'landscape' 
      }
    }

    try {
      // @ts-ignore
      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('PDF generation error:', err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="animate-in space-y-6">
      
      {/* Üst Başlık */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Palette className="w-5 h-5 text-white animate-pulse" />
        </div>
        <div>
          <h1 className="page-title">Kurumsal Afiş & QR Tasarım Sihirbazı</h1>
          <p className="page-subtitle">Hastanizin anket katılım oranlarını artırmak amacıyla, kurumsal logolu ve QR kodlu broşürlerinizi dakikalar içinde tasarlayın.</p>
        </div>
      </div>

      {error && (
        <div className="card p-4 bg-red-500/5 border-red-500/20 text-red-300 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* ⚠️ Aktif Anket Yoksa */}
      {!loadingSurveys && surveys.length === 0 && (
        <div className="card p-12 text-center max-w-2xl mx-auto flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 text-amber-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-dark-100">Aktif Anket Bulunmuyor</h3>
            <p className="text-sm text-dark-400 mt-2 leading-relaxed">
              Afiş üretebilmek için öncelikle kurumunuza tanımlanmış en az 1 adet **aktif/yayında** anket olmalıdır. 
            </p>
            <p className="text-xs text-dark-500 mt-3">
              Lütfen sol menüdeki **"Anketler"** sayfasına gidip pasif olan bir anketinizi aktifleştirin veya yeni bir anket oluşturun.
            </p>
          </div>
        </div>
      )}

      {surveys.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          
          {/* 🛠️ SOL PANEL: TASARIM KONTROLLERİ (5 Kolon) */}
          <div className="xl:col-span-5 space-y-6">
            
            {/* 1. Anket Seçimi */}
            <div className="card p-5 space-y-4">
              <h3 className="text-xs font-bold text-dark-200 uppercase tracking-wider flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" /> 1. Kampanya Anketi Seçin
              </h3>
              <select
                value={selectedSurveyId}
                onChange={e => setSelectedSurveyId(e.target.value)}
                className="input w-full bg-dark-950 border-dark-800 text-sm h-11"
              >
                {surveys.map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>

            {/* 2. Slogan ve İçerik */}
            <div className="card p-5 space-y-4">
              <h3 className="text-xs font-bold text-dark-200 uppercase tracking-wider flex items-center gap-2">
                <Type className="w-4 h-4 text-indigo-400" /> 2. İçerik ve Mesaj Ayarları
              </h3>
              
              {/* Slogan */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Afiş Ana Sloganı</label>
                <input
                  type="text"
                  value={slogan}
                  onChange={e => setSlogan(e.target.value)}
                  className="input w-full bg-dark-950 border-dark-800 text-xs h-10"
                  maxLength={50}
                />
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {SLOGANS.slice(0, 3).map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSlogan(s)}
                      className={`px-2 py-1 rounded text-[9px] font-medium transition-all ${slogan === s ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-dark-950 text-dark-400 border border-dark-800 hover:text-dark-200'}`}
                    >
                      Öneri {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alt Metin */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Açıklama Metni</label>
                <textarea
                  value={subText}
                  onChange={e => setSubText(e.target.value)}
                  rows={3}
                  className="input w-full bg-dark-950 border-dark-800 text-xs p-2.5 resize-none leading-relaxed"
                  maxLength={250}
                />
              </div>

              {/* Footer */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider">Afiş Alt Dipnot</label>
                <input
                  type="text"
                  value={footerText}
                  onChange={e => setFooterText(e.target.value)}
                  className="input w-full bg-dark-950 border-dark-800 text-xs h-10"
                />
              </div>
            </div>

            {/* 3. Görsel Tasarım Şablonu ve Palet */}
            <div className="card p-5 space-y-5">
              <h3 className="text-xs font-bold text-dark-200 uppercase tracking-wider flex items-center gap-2">
                <Layout className="w-4 h-4 text-purple-400" /> 3. Görsel Şablon ve Renk
              </h3>

              {/* Şablon Seçimi */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block">Görsel Stil Şablonu</label>
                <div className="space-y-2">
                  {TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTemplate(t.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${template === t.id ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300' : 'bg-dark-950 border-dark-800/80 text-dark-300 hover:bg-dark-900/50'}`}
                    >
                      <div>
                        <p className="text-xs font-bold">{t.label}</p>
                        <p className="text-[10px] text-dark-500 mt-0.5">{t.desc}</p>
                      </div>
                      {template === t.id && <Check className="w-4 h-4 text-indigo-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Renk Paleti */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block">Renk Teması</label>
                <div className="grid grid-cols-5 gap-2">
                  {PALETTES.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPaletteId(p.id)}
                      className={`h-10 rounded-xl border flex items-center justify-center relative overflow-hidden group transition-all ${paletteId === p.id ? 'border-white scale-[1.05] shadow' : 'border-dark-800/80'}`}
                      title={p.label}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${p.bgGrad} opacity-90`} />
                      {paletteId === p.id && <Check className="w-4 h-4 text-white z-10 drop-shadow" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Yönelim ve Bilgiler */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block">Yönelim (Baskı Ebadı)</label>
                  <div className="flex rounded-lg overflow-hidden border border-dark-800 p-1 bg-dark-950">
                    <button
                      onClick={() => setOrientation('portrait')}
                      className={`flex-1 text-center py-1.5 rounded-md text-[10px] font-bold transition-all ${orientation === 'portrait' ? 'bg-indigo-500/20 text-indigo-300' : 'text-dark-500 hover:text-dark-300'}`}
                    >
                      Dikey (A4)
                    </button>
                    <button
                      onClick={() => setOrientation('landscape')}
                      className={`flex-1 text-center py-1.5 rounded-md text-[10px] font-bold transition-all ${orientation === 'landscape' ? 'bg-indigo-500/20 text-indigo-300' : 'text-dark-500 hover:text-dark-300'}`}
                    >
                      Yatay (A5 Kart)
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block">İletişim Detayları</label>
                  <div className="grid grid-cols-2 gap-1 bg-dark-950 p-1 rounded-lg border border-dark-800">
                    <button
                      onClick={() => setShowPhone(!showPhone)}
                      className={`text-center py-1.5 rounded-md text-[10px] font-bold transition-all ${showPhone ? 'bg-indigo-500/20 text-indigo-300' : 'text-dark-600'}`}
                    >
                      Telefon
                    </button>
                    <button
                      onClick={() => setShowWeb(!showWeb)}
                      className={`text-center py-1.5 rounded-md text-[10px] font-bold transition-all ${showWeb ? 'bg-indigo-500/20 text-indigo-300' : 'text-dark-600'}`}
                    >
                      Web
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* İndirme Butonu */}
            <button
              onClick={handleDownloadPDF}
              disabled={generating}
              className="w-full btn-lg btn-primary gap-2 shadow-glow hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 h-12"
            >
              {generating ? (
                <><RefreshCw className="w-5 h-5 animate-spin" /> Yüksek Çözünürlüklü Afiş Hazırlanıyor...</>
              ) : (
                <><Printer className="w-5 h-5" /> Baskıya Hazır PDF Olarak İndir (A4/A5)</>
              )}
            </button>
          </div>

          {/* 🖼️ SAĞ PANEL: CANLI POSTER ÖNİZLEME MOCKUP (7 Kolon) */}
          <div className="xl:col-span-7 flex justify-center">
            
            {/* Poster Konteyneri */}
            <div className="bg-dark-900/30 border border-dark-800 p-4 rounded-3xl shadow-xl w-full max-w-[460px] relative overflow-hidden">
              <p className="text-[10px] text-dark-500 font-bold text-center uppercase tracking-wider mb-2 flex items-center justify-center gap-1.5">
                <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" /> Canlı Afiş Önizlemesi (Baskı Şablonu)
              </p>
              
              {/* PDF'e Çevrilecek Gerçek Alan */}
              <div 
                ref={posterRef}
                style={{
                  fontFamily: 'sans-serif',
                  color: '#1e293b',
                  backgroundColor: '#ffffff',
                }}
                className={`mx-auto shadow-2xl overflow-hidden relative flex flex-col justify-between select-none ${orientation === 'portrait' ? 'w-[380px] h-[538px] rounded-xl' : 'w-[420px] h-[297px] rounded-xl'}`}
              >
                
                {/* ── ŞABLON 1: CLINICAL CLEAN (Teal) ── */}
                {template === 'clinical' && (
                  <div className="h-full flex flex-col justify-between p-6">
                    {/* Header */}
                    <div className="text-center space-y-2 border-b-2 pb-4" style={{ borderColor: selectedPalette.primary }}>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-teal-500/10 text-teal-700">
                        <Building2 className="w-3.5 h-3.5 text-teal-600" />
                        {tenant?.name || 'T.C. SAĞLIK BAKANLIĞI'}
                      </div>
                      <h2 className="font-extrabold text-slate-800 tracking-tight leading-snug" style={{ fontSize: orientation === 'portrait' ? '18px' : '15px' }}>
                        {slogan}
                      </h2>
                    </div>

                    {/* QR Code and Instructions */}
                    <div className={`flex items-center justify-center gap-6 my-auto ${orientation === 'landscape' ? 'flex-row' : 'flex-col'}`}>
                      <div className="p-3 bg-white border-2 rounded-2xl shadow-md flex items-center justify-center shrink-0" style={{ borderColor: selectedPalette.primary }}>
                        <QRCodeCanvas value={surveyUrl} size={orientation === 'portrait' ? 120 : 100} level="H" includeMargin={false} />
                      </div>
                      <div className="space-y-2 max-w-[210px] text-center landscape:text-left">
                        <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                          {subText}
                        </p>
                        <div className="inline-flex items-center gap-1 text-[10px] font-extrabold text-teal-800 bg-teal-500/10 px-2.5 py-0.5 rounded-full">
                          <QrCode className="w-3.5 h-3.5" /> Akıllı QR Kod
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t pt-3 flex flex-col items-center justify-center gap-1.5 text-slate-400">
                      <div className="flex gap-4 text-[9px] font-bold text-slate-500">
                        {showPhone && <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5 text-teal-600" /> {tenant?.total_staff ? 'İletişim Aktif' : 'Kurum Hattı'}</span>}
                        {showWeb && <span className="flex items-center gap-1"><Globe className="w-2.5 h-2.5 text-teal-600" /> kmaras.gov.tr</span>}
                      </div>
                      <p className="text-[9px] font-extrabold text-slate-400 tracking-wider text-center">{footerText}</p>
                    </div>
                  </div>
                )}

                {/* ── ŞABLON 2: MODERN GEOMETRİK (Indigo) ── */}
                {template === 'modern' && (
                  <div className="h-full flex flex-col justify-between relative overflow-hidden">
                    {/* Arka plan geometrik süs */}
                    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${selectedPalette.bgGrad} transform rotate-45 translate-x-12 -translate-y-12 opacity-90`} />
                    <div className={`absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-br ${selectedPalette.bgGrad} transform rotate-45 -translate-x-12 translate-y-12 opacity-80`} />

                    <div className="h-full flex flex-col justify-between p-6 z-10">
                      {/* Header */}
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-extrabold tracking-widest text-indigo-700 uppercase">{tenant?.name || 'KAHRAMANMARAŞ DEVLET HASTANESİ'}</p>
                        <h2 className="font-black text-slate-900 tracking-tight leading-tight uppercase border-l-4 pl-3" style={{ fontSize: orientation === 'portrait' ? '19px' : '16px', borderLeftColor: selectedPalette.primary }}>
                          {slogan}
                        </h2>
                      </div>

                      {/* QR and Description */}
                      <div className={`flex items-center justify-center gap-6 my-auto ${orientation === 'landscape' ? 'flex-row' : 'flex-col'}`}>
                        <div className="p-3 bg-white border rounded-2xl shadow-xl flex items-center justify-center shrink-0" style={{ borderColor: '#e2e8f0' }}>
                          <QRCodeCanvas value={surveyUrl} size={orientation === 'portrait' ? 120 : 100} level="H" />
                        </div>
                        <div className="space-y-2 max-w-[210px] text-center landscape:text-left">
                          <p className="text-[10px] text-slate-600 font-bold leading-normal">
                            Katılımınız bizim için kıymetlidir!
                          </p>
                          <p className="text-[9px] text-slate-500 leading-normal">
                            {subText}
                          </p>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="border-t pt-3 flex items-center justify-between gap-2 text-slate-500 text-[8px] font-bold">
                        <span className="truncate max-w-[150px]">{footerText}</span>
                        <div className="flex gap-2 text-indigo-700">
                          {showPhone && <span>T: İletişim</span>}
                          {showWeb && <span>W: E-Devlet</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── ŞABLON 3: HASTA DOSTU (Warm Emerald) ── */}
                {template === 'warm' && (
                  <div className="h-full flex flex-col justify-between p-6">
                    {/* Top Accent */}
                    <div className={`w-full h-2 bg-gradient-to-r ${selectedPalette.bgGrad} rounded-full`} />

                    {/* Header */}
                    <div className="text-center space-y-2 my-1">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-800">
                        💚 {tenant?.name || 'T.C. SAĞLIK BAKANLIĞI'}
                      </div>
                      <h2 className="font-extrabold text-slate-900 tracking-tight leading-snug" style={{ fontSize: orientation === 'portrait' ? '18px' : '15px' }}>
                        {slogan}
                      </h2>
                    </div>

                    {/* Body */}
                    <div className={`flex items-center justify-center gap-6 my-auto ${orientation === 'landscape' ? 'flex-row' : 'flex-col'}`}>
                      <div className="p-3 bg-white border-2 border-emerald-500/20 rounded-3xl shadow-lg flex items-center justify-center shrink-0">
                        <QRCodeCanvas value={surveyUrl} size={orientation === 'portrait' ? 120 : 100} level="H" />
                      </div>
                      <div className="space-y-2 max-w-[210px] text-center landscape:text-left">
                        <p className="text-[9.5px] text-slate-600 font-semibold leading-relaxed">
                          {subText}
                        </p>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t pt-3 flex flex-col items-center justify-center gap-1">
                      <p className="text-[9px] font-black text-emerald-800 uppercase tracking-widest">{footerText}</p>
                      <div className="flex gap-3 text-[8px] font-bold text-slate-400">
                        {showPhone && <span>T.C. Sağlık İletişim</span>}
                        {showWeb && <span>Güvenli Katılım Portal</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── ŞABLON 4: ÇALIŞAN ANKETİ (Staff Amber) ── */}
                {template === 'staff' && (
                  <div className="h-full flex flex-col justify-between relative overflow-hidden">
                    {/* Sol taraf şerit */}
                    <div className={`absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-b ${selectedPalette.bgGrad}`} />

                    <div className="h-full flex flex-col justify-between p-6 pl-8">
                      {/* Header */}
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/20 text-amber-800 text-[8px] font-extrabold uppercase tracking-wide">
                          👩‍⚕️ Kurum İçi Personel Geri Bildirim
                        </div>
                        <h2 className="font-black text-slate-900 leading-tight tracking-tight uppercase mt-1" style={{ fontSize: orientation === 'portrait' ? '18px' : '15px' }}>
                          {slogan}
                        </h2>
                        <p className="text-[9px] font-bold text-slate-500">{tenant?.name}</p>
                      </div>

                      {/* QR code */}
                      <div className={`flex items-center justify-center gap-5 my-auto ${orientation === 'landscape' ? 'flex-row' : 'flex-col'}`}>
                        <div className="p-2.5 bg-white border border-amber-500/20 rounded-xl shadow-md flex items-center justify-center shrink-0">
                          <QRCodeCanvas value={surveyUrl} size={orientation === 'portrait' ? 120 : 100} level="H" />
                        </div>
                        <div className="space-y-2 max-w-[200px] text-center landscape:text-left">
                          <p className="text-[9px] text-slate-500 leading-relaxed font-semibold">
                            {subText}
                          </p>
                          <span className="inline-block text-[8px] font-black text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded uppercase">
                            Katılım Gizlidir
                          </span>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="border-t pt-3 flex items-center justify-between text-[8px] font-extrabold text-slate-400 tracking-wider">
                        <span>{footerText}</span>
                        <span className="text-amber-600">v2.0 AFİŞ</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
            
          </div>

        </div>
      )}
    </div>
  )
}
