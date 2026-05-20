import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { httpFrom } from '../../lib/supabaseHttp'

export default function ThankYouPage() {
  const { slug } = useParams()
  const [survey, setSurvey] = useState<any>(null)

  useEffect(() => {
    const loadData = async () => {
      const q = httpFrom('surveys').select('thank_you_message,title,tenant_id')
      q.eq('slug', slug!)
      const { data } = await q.single().execute()
      setSurvey(data)
    }
    if (slug) loadData()
  }, [slug])

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-6 text-center animate-in relative overflow-hidden">
      {/* Glow background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="card p-12 max-w-lg w-full border border-dark-800/80 bg-dark-900/40 backdrop-blur-xl relative z-10 shadow-[0_0_50px_rgba(0,0,0,0.3)]">
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-20 h-20 bg-green-500/10 rounded-2xl flex items-center justify-center mb-8 border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.1)] relative">
            <div className="absolute inset-0 rounded-2xl bg-green-500/5 animate-ping opacity-75" />
            <CheckCircle2 className="w-10 h-10 text-green-500 relative z-10" />
          </div>
          
          <h1 className="text-2xl font-bold text-dark-50 mb-3 tracking-tight">Katılımınız İçin Teşekkür Ederiz</h1>
          
          <p className="text-dark-300 leading-relaxed text-sm sm:text-base">
            {survey?.thank_you_message || 'Görüşleriniz bizim için çok değerlidir. Anketi başarıyla tamamladınız.'}
          </p>
        </div>
      </div>
    </div>
  )
}
