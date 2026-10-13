// Per-session pasted documents. The sample docs are shared by every visitor;
// pasted docs are visible only to the session that pasted them. Buckets are
// keyed by a session cookie and swept when idle, which also bounds memory.

export const SESSION_COOKIE = "sf_sid";

export function readSid(req: Request): string | null {
  const m = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([\\w-]+)`));
  return m ? m[1] : null;
}

const MAX_SESSIONS = 200;
const MAX_PER_SESSION = 20;
const IDLE_MS = 2 * 60 * 60 * 1000;

interface Bucket<D> {
  docs: Map<string, D>;
  lastTouch: number;
}

export function createPasteStore<D extends { id: string }>() {
  const buckets = new Map<string, Bucket<D>>();

  function sweep() {
    const now = Date.now();
    for (const [sid, b] of buckets) {
      if (now - b.lastTouch > IDLE_MS) buckets.delete(sid);
    }
    // Cap as a backstop: evict oldest-touched first.
    if (buckets.size > MAX_SESSIONS) {
      const oldest = [...buckets.entries()].sort((a, b) => a[1].lastTouch - b[1].lastTouch);
      for (const [sid] of oldest.slice(0, buckets.size - MAX_SESSIONS)) buckets.delete(sid);
    }
  }

  function bucket(sid: string): Bucket<D> {
    sweep();
    let b = buckets.get(sid);
    if (!b) {
      b = { docs: new Map(), lastTouch: Date.now() };
      buckets.set(sid, b);
    }
    b.lastTouch = Date.now();
    return b;
  }

  return {
    add(sid: string, doc: D): void {
      const b = bucket(sid);
      b.docs.set(doc.id, doc);
      // Oldest paste out first (Map preserves insertion order).
      while (b.docs.size > MAX_PER_SESSION) b.docs.delete(b.docs.keys().next().value!);
    },
    get(sid: string, id: string): D | undefined {
      return bucket(sid).docs.get(id);
    },
    list(sid: string): D[] {
      return [...bucket(sid).docs.values()];
    },
  };
}
