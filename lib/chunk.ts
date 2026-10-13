// Shared line-preparation logic: the "line" is the unit TypeSafe scores.
// Used by the paste-a-document endpoint.

export const MAX_CHUNK = 560; // chars before a paragraph splits at sentence boundaries
export const MAX_LINES = 240; // Choice over line ids stays well-behaved at this size
export const MAX_PASTE_CHARS = 60_000;

export function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+(?:["')\]]+)?\s*|[^.!?]+$/g)?.map((s) => s.trim()) ?? [text];
}

export function chunkParagraph(p: string): string[] {
  if (p.length <= MAX_CHUNK) return [p];
  const chunks: string[] = [];
  let cur = "";
  for (const s of splitSentences(p)) {
    if (cur && (cur + " " + s).length > MAX_CHUNK) {
      chunks.push(cur);
      cur = s;
    } else {
      cur = cur ? cur + " " + s : s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// Plain text/markdown → lines. Keeps single newlines as line breaks (so logs
// and markdown structure survive), splits over-long paragraphs by sentence.
export function textToLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/[\t ]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .flatMap(chunkParagraph);
}

// Code → lines, verbatim: indentation is meaning, so no trimming, merging,
// or sentence-chunking. Blank lines survive for display fidelity (the server
// skips them when building questions) but runs collapse to one.
export function codeToLines(text: string): string[] {
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  const out: string[] = [];
  for (const l of lines) {
    if (l === "" && out[out.length - 1] === "") continue;
    out.push(l);
  }
  while (out[0] === "") out.shift();
  while (out[out.length - 1] === "") out.pop();
  return out;
}
