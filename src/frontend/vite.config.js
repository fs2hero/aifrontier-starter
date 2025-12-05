import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'
import path from 'path'


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  define: {
    // 构建时注入图片
    __COM_LOGO_DATA__: JSON.stringify(
      readFileSync(path.join(__dirname,'./src/assets/comlogo.png'), 'base64')
    )
  },
  build:{
    outDir: '../../build',
    emptyOutDir: true
  }
})
