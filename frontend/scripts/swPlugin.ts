import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { buildPrecacheManifest, type BuiltFile } from '../src/pwa/manifest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * Build-only. After the bundle and public files are written, lists everything in the output
 * directory and writes `sw.js` = precache manifest + src/pwa/sw.js. Never active in `vite dev`.
 */
export function swPlugin(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'sipc-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
      root = config.root;
    },
    closeBundle() {
      const files: BuiltFile[] = walk(outDir).map((full) => ({
        path: relative(outDir, full).split(sep).join('/'),
        content: new Uint8Array(readFileSync(full)),
      }));
      const manifest = buildPrecacheManifest(files);
      const source = readFileSync(join(root, 'src/pwa/sw.js'), 'utf8');
      writeFileSync(
        join(outDir, 'sw.js'),
        `self.__SIPC_PRECACHE__ = ${JSON.stringify(manifest)};\n${source}`,
      );
    },
  };
}
