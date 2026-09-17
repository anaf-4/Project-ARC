import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Vite's default esbuild target predates top-level await support in
  // browsers; main.js uses top-level await for the boot-time live-config
  // fetch, and all shipped runtimes (Electron, Capacitor webviews, modern
  // browsers) are well past es2022, so bump the target to match.
  build: { target: 'es2022' },
});
