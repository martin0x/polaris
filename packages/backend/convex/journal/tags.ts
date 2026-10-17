import { query } from "../_generated/server";
import { assertSignedIn } from "../lib/auth";
import { AGGREGATE_SCAN_LIMIT } from "./model";

// Tags index page. entryTags holds only live entries, and the index keeps
// rows grouped and sorted by tag, so one pass counts them in order.
export const list = query({
  args: {},
  handler: async (ctx) => {
    await assertSignedIn(ctx);
    const rows = await ctx.db
      .query("entryTags")
      .withIndex("by_tag_entry_created_at")
      .take(AGGREGATE_SCAN_LIMIT);
    const out: Array<{ tag: string; count: number }> = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      if (last && last.tag === row.tag) last.count += 1;
      else out.push({ tag: row.tag, count: 1 });
    }
    return out;
  },
});
