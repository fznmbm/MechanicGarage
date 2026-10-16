export const safeColour = (c?: string | null) =>
  c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;

// Pick black or white text for best contrast on the brand colour
export function readableOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? '#0b1220' : '#ffffff';
}
