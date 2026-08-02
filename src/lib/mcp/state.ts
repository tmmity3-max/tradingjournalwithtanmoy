import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";

export type Snapshot = Record<string, string>;

export async function loadSnapshot(ctx: ToolContext): Promise<Snapshot> {
  const supabase = supabaseForUser(ctx);
  const { data, error } = await supabase
    .from("journal_state")
    .select("data")
    .eq("user_id", ctx.getUserId()!)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return ((data?.data as Snapshot | undefined) ?? {}) as Snapshot;
}

export async function saveSnapshot(ctx: ToolContext, snapshot: Snapshot): Promise<void> {
  const supabase = supabaseForUser(ctx);
  const { error } = await supabase.from("journal_state").upsert(
    {
      user_id: ctx.getUserId()!,
      data: snapshot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

/** Values are JSON strings written by the journal app; decode when possible. */
export function decode(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
