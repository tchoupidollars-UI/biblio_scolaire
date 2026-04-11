import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {
      GEMINI_API_KEY: JSON.stringify(process.env.GEMINI_API_KEY || process.env.API_KEY),
      SUPABASE_URL: JSON.stringify(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      SUPABASE_ANON_KEY: JSON.stringify(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)
    }
  }
})