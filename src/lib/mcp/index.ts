import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listJournalKeys from "./tools/list-journal-keys";
import readJournalValue from "./tools/read-journal-value";
import writeJournalValue from "./tools/write-journal-value";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "sync-go",
  title: "Sync & Go",
  version: "0.1.0",
  instructions:
    "Tools for the Sync & Go trading journal. Read and update the signed-in user's cloud-synced journal data: use `list_journal_keys` to discover stored keys, `read_journal_value` to read trades, rules or settings, and `write_journal_value` to save a value back.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listJournalKeys, readJournalValue, writeJournalValue],
});
