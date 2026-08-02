import { supabase } from "@/integrations/supabase/client";

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

export async function pullRemote(userId: string): Promise<Snapshot | null> {
  const { data, error } = await supabase
    .from("journal_state")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as Snapshot | undefined) ?? null;
}

export async function pushRemote(userId: string, snapshot: Snapshot) {
  const { error } = await supabase
    .from("journal_state")
    .upsert(
      { user_id: userId, data: snapshot, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

/** Stable stringify so key ordering (JSONB reorders keys) never looks like a change. */
export function canonical(snapshot: Snapshot): string {
  return JSON.stringify(
    Object.keys(snapshot)
      .sort()
      .map((k) => [k, snapshot[k]]),
  );
}
