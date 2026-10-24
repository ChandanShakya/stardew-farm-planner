// LZX decompressor for XNB files (the format Stardew Valley's Content/*.xnb use). Written from the
// published LZX format (as used by Microsoft cabinet files and XNA): verbatim / aligned /
// uncompressed blocks, three repeated-offset registers, pretree-coded Huffman lengths.
// XNB framing: a sequence of chunks, each `[0xFF frameHi frameLo] blockHi blockLo`, every chunk
// decompressing to at most one 32 KB frame; decoder state carries across chunks.

const MIN_MATCH = 2, NUM_CHARS = 256;
const PRETREE_MAX = 20, PRETREE_BITS = 6;
const MAIN_BITS = 12, LENGTH_MAX = 250, LENGTH_BITS = 12, ALIGNED_MAX = 8, ALIGNED_BITS = 7;
const VERBATIM = 1, ALIGNED = 2, UNCOMPRESSED = 3;

const EXTRA = new Uint8Array(51), BASE = new Uint32Array(51);
for (let i = 0, j = 0; i < 51; i += 2) { EXTRA[i] = EXTRA[i + 1] = j; if (i !== 0 && j < 17) j++; }
for (let i = 0, j = 0; i < 51; i++) { BASE[i] = j; j += 1 << EXTRA[i]; }

class Bits {
  buf = 0; left = 0; pos: number; src: Uint8Array;
  constructor(src: Uint8Array, pos: number) { this.src = src; this.pos = pos; }
  ensure(n: number) {
    while (this.left < n) {
      const lo = this.src[this.pos++] ?? 0, hi = this.src[this.pos++] ?? 0;
      this.buf = (this.buf | (((hi << 8) | lo) << (16 - this.left))) >>> 0;
      this.left += 16;
    }
  }
  peek(n: number) { return this.buf >>> (32 - n); }
  drop(n: number) { this.buf = (this.buf << n) >>> 0; this.left -= n; }
  read(n: number) { if (!n) return 0; this.ensure(n); const v = this.peek(n); this.drop(n); return v; }
}

function makeTable(nsyms: number, nbits: number, len: Uint8Array, table: Uint16Array) {
  let bitNum = 1, pos = 0, tableMask = 1 << nbits, bitMask = tableMask >> 1, next = bitMask;
  while (bitNum <= nbits) {
    for (let s = 0; s < nsyms; s++) if (len[s] === bitNum) {
      let leaf = pos; if ((pos += bitMask) > tableMask) throw new Error('LZX: bad Huffman table');
      for (let f = bitMask; f-- > 0;) table[leaf++] = s;
    }
    bitMask >>= 1; bitNum++;
  }
  if (pos !== tableMask) {
    for (let s = pos; s < tableMask; s++) table[s] = 0;
    pos <<= 16; tableMask <<= 16; bitMask = 1 << 15;
    while (bitNum <= 16) {
      for (let s = 0; s < nsyms; s++) if (len[s] === bitNum) {
        let leaf = pos >>> 16;
        for (let f = 0; f < bitNum - nbits; f++) {
          if (table[leaf] === 0) { table[next << 1] = 0; table[(next << 1) + 1] = 0; table[leaf] = next++; }
          leaf = table[leaf] << 1;
          if ((pos >>> (15 - f)) & 1) leaf++;
        }
        table[leaf] = s;
        if ((pos += bitMask) > tableMask) throw new Error('LZX: bad Huffman table');
      }
      bitMask >>= 1; bitNum++;
    }
  }
  if (pos === tableMask) return;
  for (let s = 0; s < nsyms; s++) if (len[s]) throw new Error('LZX: incomplete Huffman table');
}

function huff(b: Bits, table: Uint16Array, len: Uint8Array, bits: number, max: number) {
  b.ensure(16);
  let i = table[b.peek(bits)];
  if (i >= max) {
    let j = 1 << (32 - bits);
    do {
      j >>>= 1; i <<= 1; i |= (b.buf & j) ? 1 : 0;
      if (!j) throw new Error('LZX: bad Huffman code');
      i = table[i];
    } while (i >= max);
  }
  b.drop(len[i]);
  return i;
}

export class Lzx {
  win: Uint8Array; wsize: number; wpos = 0;
  R0 = 1; R1 = 1; R2 = 1;
  mainElements: number; headerRead = false; blockType = 0; blockRemaining = 0; blockLength = 0;
  preLen = new Uint8Array(PRETREE_MAX + 32); preTable = new Uint16Array((1 << PRETREE_BITS) + (PRETREE_MAX << 1));
  mainLen: Uint8Array; mainTable: Uint16Array; mainMax: number;
  lenLen = new Uint8Array(LENGTH_MAX + 32); lenTable = new Uint16Array((1 << LENGTH_BITS) + (LENGTH_MAX << 1));
  alLen = new Uint8Array(ALIGNED_MAX + 32); alTable = new Uint16Array((1 << ALIGNED_BITS) + (ALIGNED_MAX << 1));

  constructor(windowBits = 16) {
    this.wsize = 1 << windowBits; this.win = new Uint8Array(this.wsize);
    const slots = windowBits === 20 ? 42 : windowBits === 21 ? 50 : windowBits << 1;
    this.mainElements = NUM_CHARS + (slots << 3);
    this.mainMax = NUM_CHARS + 50 * 8;
    this.mainLen = new Uint8Array(this.mainMax + 32);
    this.mainTable = new Uint16Array((1 << MAIN_BITS) + (this.mainMax << 1));
  }

  private lengths(b: Bits, lens: Uint8Array, first: number, last: number) {
    for (let x = 0; x < 20; x++) this.preLen[x] = b.read(4);
    makeTable(PRETREE_MAX, PRETREE_BITS, this.preLen, this.preTable);
    for (let x = first; x < last;) {
      let z = huff(b, this.preTable, this.preLen, PRETREE_BITS, PRETREE_MAX);
      if (z === 17) { for (let y = b.read(4) + 4; y-- > 0;) lens[x++] = 0; }
      else if (z === 18) { for (let y = b.read(5) + 20; y-- > 0;) lens[x++] = 0; }
      else if (z === 19) {
        let y = b.read(1) + 4;
        z = huff(b, this.preTable, this.preLen, PRETREE_BITS, PRETREE_MAX);
        z = lens[x] - z; if (z < 0) z += 17;
        while (y-- > 0) lens[x++] = z;
      } else { z = lens[x] - z; if (z < 0) z += 17; lens[x++] = z; }
    }
  }

  // Decompress one chunk (inLen compressed bytes at `pos`) into exactly outLen bytes.
  decompress(src: Uint8Array, pos: number, inLen: number, outLen: number, out: Uint8Array, outPos: number) {
    const b = new Bits(src, pos), end = pos + inLen, W = this.win, wmask = this.wsize - 1;
    if (!this.headerRead) { if (b.read(1)) { b.read(16); b.read(16); } this.headerRead = true; }
    let togo = outLen;
    while (togo > 0) {
      if (this.blockRemaining === 0) {
        if (this.blockType === UNCOMPRESSED) { if (this.blockLength & 1) b.pos++; b.buf = 0; b.left = 0; }
        this.blockType = b.read(3);
        const hi = b.read(16), lo = b.read(8);
        this.blockRemaining = this.blockLength = (hi << 8) | lo;
        if (this.blockType === ALIGNED) {
          for (let i = 0; i < 8; i++) this.alLen[i] = b.read(3);
          makeTable(ALIGNED_MAX, ALIGNED_BITS, this.alLen, this.alTable);
        }
        if (this.blockType === ALIGNED || this.blockType === VERBATIM) {
          this.lengths(b, this.mainLen, 0, 256);
          this.lengths(b, this.mainLen, 256, this.mainElements);
          makeTable(this.mainMax, MAIN_BITS, this.mainLen, this.mainTable);
          this.lengths(b, this.lenLen, 0, LENGTH_MAX - 1);
          makeTable(LENGTH_MAX, LENGTH_BITS, this.lenLen, this.lenTable);
        } else if (this.blockType === UNCOMPRESSED) {
          b.ensure(16); if (b.left > 16) b.pos -= 2;
          const rd = () => { const v = src[b.pos] | (src[b.pos + 1] << 8) | (src[b.pos + 2] << 16) | (src[b.pos + 3] << 24); b.pos += 4; return v >>> 0; };
          this.R0 = rd(); this.R1 = rd(); this.R2 = rd();
          b.buf = 0; b.left = 0;
        } else throw new Error('LZX: bad block type ' + this.blockType);
      }
      while (this.blockRemaining > 0 && togo > 0) {
        let run = Math.min(this.blockRemaining, togo);
        togo -= run; this.blockRemaining -= run;
        this.wpos &= wmask;
        if (this.wpos + run > this.wsize) throw new Error('LZX: window overrun');
        if (this.blockType === UNCOMPRESSED) {
          W.set(src.subarray(b.pos, b.pos + run), this.wpos); b.pos += run; this.wpos += run; continue;
        }
        const aligned = this.blockType === ALIGNED;
        while (run > 0) {
          let el = huff(b, this.mainTable, this.mainLen, MAIN_BITS, this.mainMax);
          if (el < NUM_CHARS) { W[this.wpos++] = el; run--; continue; }
          el -= NUM_CHARS;
          let len = el & 7;
          if (len === 7) len += huff(b, this.lenTable, this.lenLen, LENGTH_BITS, LENGTH_MAX);
          len += MIN_MATCH;
          let off = el >>> 3;
          if (off > 2) {
            const extra = EXTRA[off];
            if (!aligned) { off = off !== 3 ? BASE[off] - 2 + b.read(extra) : 1; }
            else {
              let o = BASE[off] - 2;
              if (extra > 3) { o += b.read(extra - 3) << 3; o += huff(b, this.alTable, this.alLen, ALIGNED_BITS, ALIGNED_MAX); }
              else if (extra === 3) o += huff(b, this.alTable, this.alLen, ALIGNED_BITS, ALIGNED_MAX);
              else if (extra > 0) o += b.read(extra);
              else o = 1;
              off = o;
            }
            this.R2 = this.R1; this.R1 = this.R0; this.R0 = off;
          } else if (off === 0) off = this.R0;
          else if (off === 1) { off = this.R1; this.R1 = this.R0; this.R0 = off; }
          else { off = this.R2; this.R2 = this.R0; this.R0 = off; }
          run -= len;
          let dst = this.wpos, srcp: number;
          if (this.wpos >= off) srcp = dst - off;
          else {
            srcp = dst + (this.wsize - off);
            const copy = off - this.wpos;
            if (copy < len) { len -= copy; this.wpos += copy; for (let k = 0; k < copy; k++) W[dst++] = W[srcp++]; srcp = 0; }
          }
          this.wpos += len;
          for (let k = 0; k < len; k++) W[dst++] = W[srcp++];
        }
        if (run < 0) throw new Error('LZX: match ran past block');
      }
    }
    if (b.pos - 2 > end + 2) throw new Error('LZX: read past chunk');
    const start = (this.wpos === 0 ? this.wsize : this.wpos) - outLen;
    out.set(W.subarray(start, start + outLen), outPos);
  }
}

// XNB payload: chunks until `compressedLen` is consumed; returns `size` decompressed bytes.
export function lzxXnb(src: Uint8Array, compressedLen: number, size: number) {
  const out = new Uint8Array(size), d = new Lzx(16);
  let pos = 0, o = 0;
  while (pos < compressedLen && o < size) {
    let hi = src[pos], lo = src[pos + 1], frame = 0x8000, block = (hi << 8) | lo;
    if (hi === 0xff) { frame = (lo << 8) | src[pos + 2]; block = (src[pos + 3] << 8) | src[pos + 4]; pos += 5; } else pos += 2;
    if (!block || !frame) break;
    d.decompress(src, pos, block, Math.min(frame, size - o), out, o);
    o += Math.min(frame, size - o); pos += block;
  }
  if (o !== size) throw new Error(`LZX: got ${o} of ${size} bytes`);
  return out;
}
