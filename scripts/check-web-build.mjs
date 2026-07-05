#!/usr/bin/env node
/** Fail fast if the web bundle does not build (catches duplicate params, JSX errors, etc.). */
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');

await build({
  root,
  logLevel: 'error',
  build: {
    outDir: path.join(root, 'dist-check'),
    emptyOutDir: true,
  },
});

console.log('Web build check passed');
