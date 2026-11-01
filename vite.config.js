import { defineConfig } from 'vite';

// base './' => fonctionne sur GitHub Pages (/HalloweenJamIII/) sans config du nom de repo
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } }
    }
  }
});
