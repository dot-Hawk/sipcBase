import { describe, expect, it } from 'vitest';
import { buildPrecacheManifest } from './manifest';

const f = (path: string, content = path) => ({ path, content });

describe('buildPrecacheManifest', () => {
  it('lists shell files with absolute URLs and skips what must not be precached', () => {
    const m = buildPrecacheManifest([
      f('index.html'),
      f('assets/index-abc.js'),
      f('assets/font.woff2'),
      f('assets/font.woff'),
      f('assets/index-abc.js.map'),
      f('sw.js'),
      f('brand/logo-512.png'),
      f('icon-192.png'),
    ]);
    expect(m.urls).toEqual(['/assets/font.woff2', '/assets/index-abc.js', '/icon-192.png', '/index.html']);
  });

  it('always includes the app shell', () => {
    expect(() => buildPrecacheManifest([f('assets/a.js')])).toThrow(/index\.html/);
  });

  it('changes revision when any content changes and is stable otherwise', () => {
    const a = buildPrecacheManifest([f('index.html', 'a'), f('assets/x.js', '1')]);
    const same = buildPrecacheManifest([f('assets/x.js', '1'), f('index.html', 'a')]);
    const b = buildPrecacheManifest([f('index.html', 'a'), f('assets/x.js', '2')]);
    expect(same.revision).toBe(a.revision);
    expect(b.revision).not.toBe(a.revision);
  });
});
