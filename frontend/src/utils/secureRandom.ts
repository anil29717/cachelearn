/** UI-only randomness via Web Crypto (not for secrets — satisfies SAST CWE-338). */
export function secureRandomFloat(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x1_0000_0000;
}

export function secureRandomInt(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(secureRandomFloat() * (hi - lo + 1));
}
