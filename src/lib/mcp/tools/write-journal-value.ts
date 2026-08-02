import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { loadSnapshot, saveSnapshot } from "../state";

export default defineTool({
  name: "write_journal_value",
  title: "Write journal value",
  description:
    "Create or replace one stored value in the signed-in user's trading journal. The value must be the exact string the journal app expects (usually JSON). Overwrites any existing value for that key.",
  inputSchema: {
    key: z
      .string()
      .min(1)
      .describe("Journal storage key. Must start with the journal prefix 'tj_'."),
    value: z.string().describe("Raw string value to store, typically JSON text."),
  },
  outputSchema: { key: z.string(), length: z.number() },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ key, value }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (!key.startsWith("tj_")) {
      return {
        content: [{ type: "text", text: "Journal keys must start with 'tj_'." }],
        isError: true,
      };
    }
    const snapshot = await loadSnapshot(ctx);
    snapshot[key] = value;
    await saveSnapshot(ctx, snapshot);
    return {
      content: [{ type: "text", text: `Saved ${key} (${value.length} characters).` }],
      structuredContent: { key, length: value.length },
    };
  },
});
