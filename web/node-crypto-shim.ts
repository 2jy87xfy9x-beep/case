/**
 * Browser-compatible shim for `node:crypto` subset used in domain/parsers.
 * Resolved via Vite alias so bundle builds run in a browser context.
 *
 * Only implements the surface area actually used by the app:
 *   - `randomUUID()` → delegates to the Web Crypto API
 *   - `createHash(algo).update(str).digest('hex')` → FNV-1a-based multi-pass hash
 *     (adequate for deduplication / thread IDs; not a cryptographic replacement)
 */

export function randomUUID(): string {
  return crypto.randomUUID();
}

/** FNV-1a 32-bit — fast and good enough for dedup/thread IDs. */
function fnv1a32(str: string, seed = 0x811c9dc5): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

class SimpleHash {
  private readonly chunks: string[] = [];

  update(str: string): this {
    this.chunks.push(str);
    return this;
  }

  digest(_encoding: 'hex'): string {
    const combined = this.chunks.join('\x00');
    // Five independent passes → 40-char hex string (sha1-length for drop-in compat)
    const passes = [0x811c9dc5, 0xdeadbeef, 0x1234abcd, 0xfeedface, 0xc0ffee00];
    return passes.map((seed) => fnv1a32(combined, seed).toString(16).padStart(8, '0')).join('');
  }
}

export function createHash(_algorithm: string): SimpleHash {
  return new SimpleHash();
}
