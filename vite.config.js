import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 專案頁面網址： https://你的帳號.github.io/fakeYT/
// 所以 base 必須是 repo 名稱 /fakeYT/。
export default defineConfig({
  plugins: [react()],
  base: '/',
})
