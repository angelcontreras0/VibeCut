export const clamp = (v: number, a: number, b: number) =>
  Math.min(b, Math.max(a, v));
export function time(v: number) {
  const n = Math.round(Math.max(0, v) * 1000);
  return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")}.${String(n % 1000).padStart(3, "0")}`;
}
export function parse(s: string) {
  const p = s.split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : NaN;
}
export const mb = (n: number) => (n / 1e6).toFixed(2);
