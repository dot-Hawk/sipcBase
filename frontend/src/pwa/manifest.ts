export interface BuiltFile {
  /** Path relative to the build output directory, with forward slashes. */
  path: string;
  content: string | Uint8Array;
}

export interface PrecacheManifest {
  /** Short content hash of the whole shell; names the cache so an update never reuses an old one. */
  revision: string;
  urls: string[];
}

const SKIP = [/\.map$/, /\.woff$/, /^sw\.js$/, /^brand\/logo-512\.png$/];

/** FNV-1a over bytes, hex. Not cryptographic: it only has to change when the shell changes. */
function hash(parts: (string | Uint8Array)[]): string {
  let h = 0x811c9dc5;
  const enc = new TextEncoder();
  for (const part of parts) {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    for (const b of bytes) {
      h ^= b;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0xff; // separator
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function buildPrecacheManifest(files: BuiltFile[]): PrecacheManifest {
  const kept = files.filter((f) => !SKIP.some((re) => re.test(f.path))).sort((a, b) => a.path.localeCompare(b.path));
  if (!kept.some((f) => f.path === 'index.html')) throw new Error('Precache manifest needs index.html');
  return {
    revision: hash(kept.flatMap((f) => [f.path, f.content])),
    urls: kept.map((f) => `/${f.path}`),
  };
}
