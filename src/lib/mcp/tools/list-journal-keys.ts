import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { loadSnapshot } from "../state";

export default defineTool({
  name: "list_journal_keys",
  title: "List journal keys",
  description:
    "List every stored key in the signed-in user's trading journal, with the size of each stored value.",
  inputSchema: {},
  outputSchema: { keys: z.array(z.object({ key: z.string(), length: z.number() })) },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const snapshot = await loadSnapshot(ctx);
    const keys = Object.keys(snapshot)
      .sort()
      .map((key) => ({ key, length: snapshot[key]?.length ?? 0 }));
    return {
      content: [{ type: "text", text: JSON.stringify(keys, null, 2) }],
      structuredContent: { keys },
    };
  },
});
