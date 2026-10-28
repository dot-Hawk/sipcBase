import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('app branding', () => {
  it('uses SIPC as the document title, not a mobile-only name', () => {
    expect(read('index.html')).toMatch(/<title>SIPC<\/title>/);
  });

  it('names the installed app SIPC in the manifest', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest')) as { name: string; short_name: string };
    expect(manifest.name).toBe('SIPC');
    expect(manifest.short_name).toBe('SIPC');
  });

  it('uses the current institution name in shared assets and metadata', () => {
    for (const path of ['index.html', 'public/brand/mark.svg', 'src/features/cuenta/CuentaPage.tsx']) {
      expect(read(path), path).not.toMatch(/Documentaci[oó]n/);
    }
  });

  it('does not label surveyor screens as field work', () => {
    for (const path of [
      'src/features/asignaciones/VisitasPage.tsx',
      'src/features/precios/PreciosPage.tsx',
      'src/features/cuenta/CuentaPage.tsx',
    ]) {
      expect(read(path), path).not.toMatch(/['"]Campo['"]/);
    }
  });

  it('describes SIPC by its official full name', () => {
    expect(read('index.html')).toMatch(/Sistema Integral para la Gestión del Índice de Precios al Consumidor/);
    expect(read('index.html')).not.toMatch(/relevamiento de precios\./i);
  });
});
