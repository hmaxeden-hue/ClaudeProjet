import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the build works when served from a sub-path
  // (e.g. GitHub Pages at /ClaudeProjet/). Safe together with HashRouter.
  base: './',
  plugins: [react(), tailwindcss()],
});
