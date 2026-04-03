import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // VITE_ prefix 없는 변수도 로드

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        // /api/tts → Google Cloud TTS (CORS 우회 + API 키 서버 측 주입)
        '/api/tts': {
          target: 'https://texttospeech.googleapis.com',
          changeOrigin: true,
          rewrite: () => `/v1/text:synthesize?key=${env.GOOGLE_TTS_API_KEY ?? ''}`,
        },
      },
    },
  }
})
