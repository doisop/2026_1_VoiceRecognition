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
        // /api/tts → Naver Clova Voice API (CORS 우회 + API 키 서버 측 주입)
        '/api/tts': {
          target: 'https://naveropenapi.apigw.ntruss.com',
          changeOrigin: true,
          rewrite: () => '/tts-premium/v1/tts',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('X-NCP-APIGW-API-KEY-ID', env.NAVER_CLIENT_ID ?? '')
              proxyReq.setHeader('X-NCP-APIGW-API-KEY', env.NAVER_CLIENT_SECRET ?? '')
            })
          },
        },
      },
    },
  }
})
