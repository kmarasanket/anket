import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Büyük bundle uyarı limitini kaldır, zaten code splitting yapıyoruz
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Daha granüler code splitting — her sayfa kendi paketinde
        manualChunks(id) {
          // Temel framework
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router')) {
            return 'vendor'
          }
          // Supabase istemcisi
          if (id.includes('node_modules/@supabase')) {
            return 'supabase'
          }
          // İkon kütüphanesi
          if (id.includes('node_modules/lucide-react')) {
            return 'ui-icons'
          }
          // Grafik kütüphanesi — sadece Raporlar sayfasında lazım, ayrı bundle
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory')) {
            return 'charts'
          }
          // QR kod ve PDF kütüphaneleri — sadece Anketler listesinde
          if (id.includes('node_modules/qrcode') || id.includes('node_modules/html2pdf') || id.includes('node_modules/html2canvas') || id.includes('node_modules/jspdf')) {
            return 'pdf-qr'
          }
          // Zustand durum yönetimi
          if (id.includes('node_modules/zustand')) {
            return 'vendor'
          }
        }
      }
    }
  },
  // Development sunucu için optimize et
  server: {
    warmup: {
      // En sık kullanılan dosyaları önceden ısıt
      clientFiles: [
        './src/App.tsx',
        './src/lib/supabaseHttp.ts',
        './src/stores/authStore.ts',
      ]
    }
  }
})
