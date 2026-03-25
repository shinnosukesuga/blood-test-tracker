/**
 * 全角数字・小数点を半角に変換し、数値文字列のみを返す
 */
export function sanitizeNum(v: string): string {
  const half = v.replace(/[０-９．]/g, s =>
    s === "．" ? "." : String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
  );
  const c = half.replace(/[^0-9.]/g, "");
  const parts = c.split(".");
  return parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : c;
}
