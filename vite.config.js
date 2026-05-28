import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  // 💡 設定正確的 GitHub Pages 專案路徑，這樣線上打包才找得到 src/assets 的圖片
  base: '/fakeYT/', 
})