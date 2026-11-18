import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// 網站主體仍是靜態頁面；只有 /api/* 會在 Vercel 上以 Function 執行
export default defineConfig({
  adapter: vercel(),
  devToolbar: {
    enabled: false
  }
});
server: {
  allowedHosts: ['.app.github.dev']
}