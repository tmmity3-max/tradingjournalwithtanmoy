import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type QuerySnapshot,
} from "firebase/firestore";
import { getDb } from "@/integrations/firebase/client";

export const PREFIX = "tj_";

export type Snapshot = Record<string, string>;

export function readLocal(): Snapshot {
  const out: Snapshot = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) out[k] = localStorage.getItem(k) ?? "";
  }
  return out;
}

export function writeLocal(snapshot: Snapshot) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX) && !(k in snapshot)) localStorage.removeItem(k);
  }
  for (const [k, v] of Object.entries(snapshot)) localStorage.setItem(k, v);
}

// Layout in Firestore (one small document per journal key, so the 1 MiB
// per-document limit applies to each key rather than to the whole journal):
//   users/{uid}/journal/{encodedKey}  ->  { key, value }
//   users/{uid}/charts/{chartId}      ->  { dataUrl }
const journalCol = (uid: string) => collection(getDb(), "users", uid, "journal");
const docId = (key: string) => encodeURIComponent(key);

/** Convert a journal collection snapshot into a plain key -> value map. */
export function toSnapshot(qs: QuerySnapshot): Snapshot {
  const out: Snapshot = {};
  qs.forEach((d) => {
    const { key, value } = d.data() as { key?: string; value?: string };
    if (key) out[key] = value ?? "";
  });
  return out;
}

export async function pullRemote(uid: string): Promise<Snapshot | null> {
  const qs = await getDocs(journalCol(uid));
  return qs.empty ? null : toSnapshot(qs);
}

/** Write only what changed since `previous` (the last state known to be in the cloud). */
export async function pushRemote(uid: string, snapshot: Snapshot, previous: Snapshot | null) {
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  const col = journalCol(uid);
  for (const [key, value] of Object.entries(snapshot)) {
    if (previous && previous[key] === value) continue;
    ops.push((b) => b.set(doc(col, docId(key)), { key, value }));
  }
  if (previous) {
    for (const key of Object.keys(previous)) {
      if (!(key in snapshot)) ops.push((b) => b.delete(doc(col, docId(key))));
    }
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(getDb());
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

/** Stable stringify so key ordering never looks like a change. */
export function canonical(snapshot: Snapshot): string {
  return JSON.stringify(
    Object.keys(snapshot)
      .sort()
      .map((k) => [k, snapshot[k]]),
  );
}

export { journalCol };

// ---- Chart screenshots (stored as compressed JPEG data URLs in Firestore) ----
// Firebase's Cloud Storage needs the paid Blaze plan, so images live in Firestore instead.
const MAX_CHART_CHARS = 950_000; // keep under Firestore's 1 MiB document limit

export async function uploadChart(uid: string, chartId: string, dataUrl: string): Promise<string> {
  if (dataUrl.length > MAX_CHART_CHARS) throw new Error("Screenshot too large");
  await setDoc(doc(getDb(), "users", uid, "charts", chartId), { dataUrl });
  return chartId;
}

export async function chartObjectUrl(uid: string, chartId: string): Promise<string> {
  const snap = await getDoc(doc(getDb(), "users", uid, "charts", chartId));
  const dataUrl = (snap.data() as { dataUrl?: string } | undefined)?.dataUrl;
  if (!dataUrl) throw new Error("not found");
  // Blob URLs (unlike data: URLs) can be opened in a new tab.
  return URL.createObjectURL(await (await fetch(dataUrl)).blob());
}

export async function deleteChart(uid: string, chartId: string) {
  await deleteDoc(doc(getDb(), "users", uid, "charts", chartId));
}
