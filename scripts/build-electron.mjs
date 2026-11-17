// Собирает серверную часть в один файл для настольного приложения.
// Перед этим должен быть выполнен `vite build` (папка dist).
import { build } from 'esbuild';
import fs from 'node:fs';

fs.rmSync('build-electron', { recursive: true, force: true });

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'build-electron/server.mjs',
  external: ['vite', 'node:sqlite'],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
