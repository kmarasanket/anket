import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-6 text-center animate-in">
      <div className="w-24 h-24 bg-dark-900 rounded-3xl flex items-center justify-center mb-6 shadow-glow-sm">
        <span className="text-4xl font-bold gradient-text">404</span>
      </div>
      <h1 className="text-2xl font-bold text-dark-50 mb-2">Sayfa Bulunamadı</h1>
      <p className="text-dark-400 max-w-md mb-8">
        Aradığınız sayfa silinmiş, taşınmış veya hiç var olmamış olabilir. URL'yi kontrol edin.
      </p>
      <Link to="/" className="btn-md btn-primary">
        <Home className="w-4 h-4" /> Ana Sayfaya Dön
      </Link>
    </div>
  )
}
