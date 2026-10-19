import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // Klasszikus (nem modul) szkript egyetlen csomagban: így a scripts/inline.mjs egyetlen önálló HTML-be tudja foglalni,
    // amely fájlból megnyitva is működik.
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: { output: { format: 'iife' } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
