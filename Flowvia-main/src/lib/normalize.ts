
export function normalizeProductCode(v: string) {
  return (v || '').trim().toUpperCase();
}
