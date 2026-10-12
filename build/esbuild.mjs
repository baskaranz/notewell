// Bundles the renderer (CodeMirror + app code) into a single browser script.
// Run via `npm run bundle`. Pass --watch for incremental rebuilds.
import { build, context } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const options = {
  entryPoints: [path.join(root, 'src/renderer/renderer.js')],
  outfile: path.join(root, 'src/renderer/renderer.bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('esbuild: watching renderer…');
} else {
  await build(options);
}
