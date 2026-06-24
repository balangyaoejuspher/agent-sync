import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  splitting: false,
  shims: false,
  sourcemap: false,
  minify: false,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node'
  }
});
