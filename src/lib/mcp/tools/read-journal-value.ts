import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { decode, loadSnapshot } from "../state";

export default defineTool({
  name: "read_journal_value",
  title: "Read journal value",
  description:
    "Read one stored value from the signed-in user's trading journal by key (e.g. a trades list or settings entry). Use list_journal_keys first to discover keys.",
  inputSchema: {
    key: z.string().min(1).describe("Journal storage key, as returned by list_journal_keys."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ key }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const snapshot = await loadSnapshot(ctx);
    if (!(key in snapshot)) {
      return { content: [{ type: "text", text: `No journal value stored for key "${key}".` }], isError: true };
    }
    const value = decode(snapshot[key] ?? "");
    return {
      content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
      structuredContent: { key, value },
    };
  },
});
