// Joins every file in supabase/migrations/ (oldest first) into
// supabase/setup.sql, so a new project can be set up with one paste into the
// Supabase SQL Editor. Re-run after adding a migration:
//
//   npm run db:bundle
//
// The unit tests fail if setup.sql is out of date.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../supabase/migrations/", import.meta.url);
export function bundle() {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const parts = files.map((f) => `-- ===========================================================================\n-- ${f}\n-- ===========================================================================\n\n${readFileSync(new URL(f, dir), "utf8").trim()}\n`);
  return `-- Method V: the whole database in one go, for a NEW Supabase project.
-- Paste all of this into Supabase → SQL Editor → New query, and press Run.
-- Generated from supabase/migrations/ by \`npm run db:bundle\`; don't edit by hand.
-- Already set up? Run only the migration files you haven't run yet instead.

${parts.join("\n")}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("../supabase/setup.sql", import.meta.url), bundle());
  console.log("wrote supabase/setup.sql");
}
