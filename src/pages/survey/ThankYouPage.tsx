import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { CheckCircle2, Home } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function ThankYouPage() {
  const { slug } = useParams()
  const [survey, setSurvey] = useState<any>(null)

  useEffect(() => {
    const loadData = async () => {
      const { data } = await supabase.from('surveys').select('thank_you_message, title, tenant_id').eq('slug', slug).single()
      setSurvey(data)
    }
    if (slug) loadData()
  }, [slug])

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-6 text-center animate-in">
      <div className="card p-10 max-w-lg w-full relative overflow-hidden">
        {/* Dekoratif Arka Plan */}
        <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
          <div className="w-64 h-64 bg-green-500 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          
          <h1 className="text-2xl font-display font-bold text-dark-50 mb-4">Yanıtınız Kaydedildi</h1>
          
          <p className="text-dark-300 mb-8 text-lg">
            {survey?.thank_you_message || 'Ankete katıldığınız için teşekkür ederiz. Görüşleriniz bizim için çok değerlidir.'}
          </p>

          <div className="w-full h-px bg-dark-800 mb-8" />

          {/* Sadece ana sayfaya dönüş değil, kurum sitesine dönüş gibi linkler eklenebilir */}
          <Link to="/" className="text-dark-500 hover:text-dark-300 font-medium text-sm flex items-center gap-2 transition-colors">
            <Home className="w-4 h-4" /> Anket Platformu Ana Sayfa
          </Link>
        </div>
      </div>
    </div>
  )
}
