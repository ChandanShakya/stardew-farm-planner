// Share links: one plan, deflate-compressed and base64url-encoded into the URL hash (#s=...).
// The hash never reaches a server, so a shared plan stays between the people holding the link.
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(t)).arrayBuffer());
}
export async function encodeShare(payload: unknown) {
  const z = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('deflate-raw'));
  let s = ''; for (let i = 0; i < z.length; i += 0x8000) s += String.fromCharCode(...z.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function decodeShare(s: string): Promise<unknown> {
  if (s.length > 200_000) throw new Error('link too long');
  const raw = await pipe(unb64u(s), new DecompressionStream('deflate-raw'));
  if (raw.length > 5_000_000) throw new Error('link payload too large');
  return JSON.parse(new TextDecoder().decode(raw));
}
