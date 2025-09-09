export function chunkText(text: string, chunkSize = 1000, overlap = 150): string[] {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out: string[] = [];
  let i = 0;
  const step = Math.max(1, chunkSize - overlap);
  while (i < clean.length) {
    out.push(clean.slice(i, i + chunkSize));
    i += step;
  }
  return out;
}
