import { useState } from 'react'
import {
  HelpCircle, Info, BookOpen, Layers, HelpCircle as FAQIcon,
  ChevronDown, ChevronUp, CheckCircle, ArrowRight,
  Clipboard, QrCode, TrendingUp, BarChart4, Settings, ShieldAlert,
  Download, FileText, CheckCircle2, Users
} from 'lucide-react'

export default function AdminHelpPage() {
  const [activeSubTab, setActiveSubTab] = useState<'intro' | 'guides' | 'screens' | 'faq'>('intro')
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index)
  }

  const faqs = [
    {
      q: 'Aylık anket hedef ve kotaları nasıl hesaplanıyor?',
      a: 'Anketlerinizin hedef örneklem sayıları, kurum ayarlarında belirttiğiniz bir önceki yıla ait toplam hasta veya personel sayısına göre Cochran Örneklem Formülü (Population: N, Hata Payı: %5, Güven Düzeyi: %95) kullanılarak otomatik belirlenir. Belirlenen yıllık hedef örneklem sayısı 12 aya eşit olarak bölünerek her ay için "Aylık Hedef Kota" belirlenir. Sistem bu hedefleri "Anket Durumu" ekranında canlı olarak takip eder.'
    },
    {
      q: 'Anket yayından kaldırılırsa veya pasife alınırsa ne olur?',
      a: 'Bir anketi pasif duruma getirdiğinizde, o anketin QR kodu veya katılım linki üzerinden yeni yanıt verilemez. Kullanıcılar anketin süresinin dolduğuna dair şık bir bilgilendirme ekranıyla karşılaşırlar. Ancak geçmişte verilen hiçbir yanıt silinmez ve sonuçları incelemeye devam edebilirsiniz.'
    },
    {
      q: 'Katılımcı yanıtlarını kimler silebilir?',
      a: 'Veri güvenliği ve anket bütünlüğünün korunması adına, kurum admin kullanıcıları katılımcı yanıtlarını detaylı inceleyebilir ve Excel/PDF raporları alabilir fakat yanıt silme yetkisine sahip değildir. Yanıt silme işlemleri yalnızca sistemsel hataları gidermek amacıyla İl Sağlık Müdürlüğü / Süper Admin yetkilileri tarafından gerçekleştirilebilir.'
    },
    {
      q: 'Sonuç Raporunu ve Grafik Analizleri nasıl indirebilirim?',
      a: 'Sonuçlar ekranındaki her sekme (Seçenek Bazında Cevap Raporu, Soru Bazında Karşılanma, Soru Bazında Analiz, Sonuç Raporu vb.) kendine özel "PDF Olarak Kaydet" veya "PDF Raporu İndir" butonlarına sahiptir. Bu butonlar, ekranı A4 dikey veya yatay formatta birebir kurumsal rapora dönüştürerek bilgisayarınıza kaydeder. Ayrıca genel listeyi Excel olarak dışa aktarabilirsiniz.'
    },
    {
      q: 'Örneklem hedefine ulaşıldıktan sonra anket durdurulmalı mı?',
      a: 'Hayır, Cochran örneklem sayısı bilimsel açıdan elde edilmesi gereken minimum katılımcı sınırını temsil eder. Bu sayıya ulaşılması verilerinizin doğruluğunu kesinleştirir. Hedef aşıldıktan sonra da anketin açık kalması ve daha fazla katılım toplanması, analiz kalitesini artıracağı için anketin kapatılması önerilmez.'
    }
  ]

  return (
    <div className="animate-in space-y-6 max-w-5xl">
      {/* Üst Banner */}
      <div className="bg-gradient-to-r from-primary-600/20 via-primary-500/10 to-transparent p-6 rounded-2xl border border-primary-500/20 relative overflow-hidden">
        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
          <HelpCircle className="w-40 h-40" />
        </div>
        <div className="relative z-10 space-y-2">
          <span className="bg-primary-500/10 text-primary-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Destek ve Rehberlik
          </span>
          <h1 className="text-2xl lg:text-3xl font-black text-dark-50">Bilgi ve Yardım Merkezi</h1>
          <p className="text-dark-300 text-sm max-w-2xl leading-relaxed">
            Memnuniyet Ölçme ve Geri Bildirim Sistemini en verimli şekilde kullanabilmeniz için hazırlanan adım adım kullanım kılavuzu, ekran tanımları ve sıkça sorulan sorulara buradan ulaşabilirsiniz.
          </p>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex border-b border-dark-800 bg-dark-900/30 p-1.5 rounded-xl gap-1">
        <button
          onClick={() => setActiveSubTab('intro')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-lg transition-all ${
            activeSubTab === 'intro'
              ? 'bg-primary-500 text-white shadow-lg'
              : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/50'
          }`}
        >
          <Info className="w-4 h-4" />
          Genel Tanıtım
        </button>
        <button
          onClick={() => setActiveSubTab('guides')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-lg transition-all ${
            activeSubTab === 'guides'
              ? 'bg-primary-500 text-white shadow-lg'
              : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/50'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Nasıl Yapılır? (Rehber)
        </button>
        <button
          onClick={() => setActiveSubTab('screens')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-lg transition-all ${
            activeSubTab === 'screens'
              ? 'bg-primary-500 text-white shadow-lg'
              : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/50'
          }`}
        >
          <Layers className="w-4 h-4" />
          Ekran Tanımları
        </button>
        <button
          onClick={() => setActiveSubTab('faq')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-lg transition-all ${
            activeSubTab === 'faq'
              ? 'bg-primary-500 text-white shadow-lg'
              : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/50'
          }`}
        >
          <FAQIcon className="w-4 h-4" />
          Sıkça Sorulan Sorular
        </button>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* SEKME 1: GENEL TANITIM */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'intro' && (
        <div className="space-y-6">
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-bold text-dark-100 flex items-center gap-2 border-b border-dark-800 pb-3">
              <CheckCircle className="w-5 h-5 text-primary-400" />
              Sistem Genel Tanıtımı ve Vizyonu
            </h2>
            <p className="text-dark-300 text-sm leading-relaxed">
              Bu platform, sağlık kurumlarında <strong>Ayaktan Hasta</strong>, <strong>Yatan Hasta</strong>, <strong>Acil Servis</strong> ve <strong>Çalışan Personel</strong> memnuniyetini bilimsel yöntemlerle ölçmek, anlık olarak izlemek ve veri odaklı kararlar alınmasını sağlamak amacıyla geliştirilmiş yenilikçi bir yönetim sistemidir.
            </p>
            <p className="text-dark-300 text-sm leading-relaxed">
              Geleneksel anket sistemlerinin aksine, bu platformda kotalar rastgele belirlenmez. Kurumunuzun geçmiş yıl hasta sayıları ve mevcut personel sayıları baz alınarak **Cochran Bilimsel Örneklem Formülü** uygulanır. Bu sayede, elde edilen verilerin istatistiksel olarak güvenilirliği ve kurumu temsil etme yeteneği tam güvence altındadır.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-dark-900/60 border border-dark-800 rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-dark-100">Bilimsel Cochran Metodolojisi</h3>
              <p className="text-xs text-dark-400 leading-relaxed">
                Her kurumun büyüklüğüne göre asgari katılım sayısı otomatik hesaplanır. Güven aralığı %95, hata payı %5 olarak kabul edilir. Böylece toplanan geri bildirimlerin doğruluğu tescillenir.
              </p>
            </div>
            <div className="bg-dark-900/60 border border-dark-800 rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-dark-100">Eylem Odaklı Karar Destek</h3>
              <p className="text-xs text-dark-400 leading-relaxed">
                Dönemsel karşılaştırma ekranları sayesinde memnuniyeti düşen ve iyileşen alanlar otomatik saptanır. Bu sayede yöneticilerin nokta atışı iyileştirmeler yapması kolaylaşır.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* SEKME 2: NASIL YAPILIR? */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'guides' && (
        <div className="space-y-6">
          
          {/* Adım 1: Anket Durumu */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-primary-500/10 text-primary-400 flex items-center justify-center font-bold text-sm shrink-0">
                1
              </div>
              <h3 className="text-md font-bold text-dark-100">Anket Nasıl Yayınlanır ve Kontrol Edilir?</h3>
            </div>
            <p className="text-xs text-dark-300 leading-relaxed pl-12">
              Sol menüdeki <strong>"Anketler"</strong> sayfasına gidin. Bu sayfada kurumunuza atanmış tüm aktif ve pasif anketleri kartlar halinde göreceksiniz. Anket kartlarının sağ altında bulunan **"Aktif / Pasif"** durum anahtarını kullanarak istediğiniz anketi tek tıkla yayına alabilir veya katılımı durdurmak için yayından kaldırabilirsiniz.
            </p>
          </div>

          {/* Adım 2: Link ve QR Kod */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-primary-500/10 text-primary-400 flex items-center justify-center font-bold text-sm shrink-0">
                2
              </div>
              <h3 className="text-md font-bold text-dark-100">Anket Linki ve QR Kod Nasıl Temin Edilir?</h3>
            </div>
            <div className="text-xs text-dark-300 leading-relaxed pl-12 space-y-3">
              <p>Anketleri katılımcılara ulaştırmak için iki temel yöntem bulunmaktadır:</p>
              <ul className="list-disc pl-4 space-y-2">
                <li>
                  <strong>Katılım Linki:</strong> Anket kartının üzerindeki **"Linki Kopyala"** butonuna basarak anket katılım linkini panoya kopyalayabilir; SMS, web sitesi veya sosyal medya aracılığıyla dağıtabilirsiniz.
                </li>
                <li>
                  <strong>QR Kod Kartı (PDF):</strong> Anket kartında yer alan **"QR KOD AL"** butonuna tıklayarak, anketin adı, hastane adı ve dinamik olarak oluşturulmuş yüksek çözünürlüklü QR kodunu içeren dikey kurumsal masaüstü broşürünü (A5/A4 formatında) PDF olarak bilgisayarınıza indirebilir, çıktı alıp bekleme salonlarına veya birimlere yerleştirebilirsiniz.
                </li>
              </ul>
            </div>
          </div>

          {/* Adım 3: Sonuçlar */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-primary-500/10 text-primary-400 flex items-center justify-center font-bold text-sm shrink-0">
                3
              </div>
              <h3 className="text-md font-bold text-dark-100">Sonuçlar Nasıl İncelenir ve Raporlanır?</h3>
            </div>
            <p className="text-xs text-dark-300 leading-relaxed pl-12">
              Bir anketin sonuçlarına bakmak için ilgili anket kartının sağ altındaki **"Sonuçlar"** butonuna tıklamanız yeterlidir. Sonuçlar ekranında sizi **Katılımcı Listesi**, seçenek dağılımlarını gösteren **Cevap Dağılım Raporu**, Likert puanlı karşılanma düzeyini gösteren **Karşılanma Oranları**, pasta grafikli **Soru Bazında Analiz (Grafik)**, kelime sıklığını analiz eden **Kelime Bulutu**, demografik kırılımları kıyaslayan **Çapraz Analiz** ve nihayet profesyonel metin tabanlı **Sonuç Raporu** karşılar. İlgili ekranlardaki butonlarla Excel veya dikey A4 PDF çıktısı alabilirsiniz.
            </p>
          </div>

          {/* Adım 4: Dönemsel Karşılaştırma */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-primary-500/10 text-primary-400 flex items-center justify-center font-bold text-sm shrink-0">
                4
              </div>
              <h3 className="text-md font-bold text-dark-100">Dönemsel Karşılaştırma (Kıyaslama) Analizi Nasıl Yapılır?</h3>
            </div>
            <p className="text-xs text-dark-300 leading-relaxed pl-12">
              Sol menüdeki <strong>"Dönemsel Karşılaştırma"</strong> sayfasına gidin. Kıyaslamak istediğiniz anketi seçin. Ardından karşılaştırmak istediğiniz eski dönemi (1. Dönem Yıl/Ay) ve yeni dönemi (2. Dönem Yıl/Ay) seçerek saniyeler içinde genel memnuniyet gelişimini, en çok puanı artan (iyileşen) konuları ve memnuniyeti düşen öncelikli düzeltici eylem planı gerektiren konuları grafik ve tablolarla analiz edebilirsiniz.
            </p>
          </div>

        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* SEKME 3: EKRAN TANIMLARI */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'screens' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Dashboard */}
            <div className="card p-5 space-y-2">
              <h3 className="text-sm font-bold text-dark-100 flex items-center gap-2 border-b border-dark-800 pb-2">
                <BarChart4 className="w-4 h-4 text-primary-400" />
                Dashboard (Yönetici Paneli)
              </h3>
              <p className="text-xs text-dark-400 leading-relaxed">
                Giriş yaptığınızda sizi karşılayan ana ekrandır. Toplam anket sayısı, toplam katılım miktarı, aylık kota ilerleme durumu, anket bazlı yüzdesel tamamlanma göstergeleri ve en son katılımlar gibi anlık kurum özetlerini sunar.
              </p>
            </div>

            {/* Anketler */}
            <div className="card p-5 space-y-2">
              <h3 className="text-sm font-bold text-dark-100 flex items-center gap-2 border-b border-dark-800 pb-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                Anketler (Yayınlama)
              </h3>
              <p className="text-xs text-dark-400 leading-relaxed">
                Tüm anketlerinizi listeleyen sayfadır. Hangi anketin kaç katılımı olduğunu ve yayında olup olmadığını kontrol eder. Sonuçlar ekranına geçiş, katılım linki kopyalama ve broşür/QR kod temin etme butonları bu sayfada yer alır.
              </p>
            </div>

            {/* Anket Durumu */}
            <div className="card p-5 space-y-2">
              <h3 className="text-sm font-bold text-dark-100 flex items-center gap-2 border-b border-dark-800 pb-2">
                <Clipboard className="w-4 h-4 text-purple-400" />
                Anket Durumu (Kota Takibi)
              </h3>
              <p className="text-xs text-dark-400 leading-relaxed">
                Cochran örneklem formülüne göre belirlenen hedeflerin takibini kolaylaştırır. Ayın kalan gün sayısını, aylık kotaların ne kadarının tamamlandığını, hedefe ulaşmak için kaç anket daha toplanması gerektiğini gösteren canlı gösterge panelidir.
              </p>
            </div>

            {/* Kurum Ayarları */}
            <div className="card p-5 space-y-2">
              <h3 className="text-sm font-bold text-dark-100 flex items-center gap-2 border-b border-dark-800 pb-2">
                <Settings className="w-4 h-4 text-blue-400" />
                Kurum Ayarları (İstatistikler)
              </h3>
              <p className="text-xs text-dark-400 leading-relaxed">
                Kurumunuza ait toplam personel sayısını ve bir önceki yıla ait toplam poliklinik (ayaktan), yatan hasta ve acil servis hasta sayılarını girdiğiniz kritik sayfadır. Bu veriler doldurulmadan kotalar doğru hesaplanamaz.
              </p>
            </div>

          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* SEKME 4: SIKÇA SORULAN SORULAR */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'faq' && (
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-bold text-dark-100 border-b border-dark-800 pb-3 mb-2 flex items-center gap-2">
            <FAQIcon className="w-5 h-5 text-primary-400" />
            Sıkça Sorulan Sorular
          </h2>
          
          <div className="space-y-3">
            {faqs.map((faq, i) => {
              const isOpen = openFaqIndex === i
              return (
                <div key={i} className="border border-dark-800 rounded-xl overflow-hidden transition-all bg-dark-950/20">
                  <button
                    onClick={() => toggleFaq(i)}
                    className="w-full flex items-center justify-between p-4 text-left font-semibold text-xs sm:text-sm text-dark-100 hover:bg-dark-800/40 transition-colors"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-primary-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-dark-500 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="p-4 pt-0 border-t border-dark-850 text-xs sm:text-sm text-dark-350 leading-relaxed bg-dark-900/10">
                      {faq.a}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* İletişim / Yardım Alt Alanı */}
      <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-sm font-bold text-dark-100 flex items-center gap-2 justify-center sm:justify-start">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Teknik Sorun veya Destek Talebi mi Var?
          </h3>
          <p className="text-xs text-dark-400">
            Sistemsel bir hata aldığınızda veya yetkilendirme işlemlerinde İl Sağlık Müdürlüğü Sistem Yöneticisi ile iletişime geçebilirsiniz.
          </p>
        </div>
        <div className="shrink-0 text-xs font-semibold text-dark-400 bg-dark-800 px-3 py-1.5 rounded-lg border border-dark-750">
          Destek E-posta: kahramanmaras@saglik.gov.tr
        </div>
      </div>

    </div>
  )
}
