import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'

// PWA Service Worker Kaydı
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('Yeni bir sürüm mevcut. Sayfa yenilensin mi?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('Uygulama çevrimdışı kullanıma hazır.')
  },
})

// CSRF / Polyfills if needed
window.global ||= window

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
