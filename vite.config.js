import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      // 引擎改从本地 vendor 包的可编辑 TypeScript 源码导入（逆向编译产物）
      '@bleckert/football-simulator': fileURLToPath(new URL('./vendor/football-simulator/src/index.ts', import.meta.url)),
      // 旧版 Game 类引用了 Node 内置的 events，浏览器侧给一个最小垫片
      events: fileURLToPath(new URL('./shims/events.js', import.meta.url)),
    },
  },
});
