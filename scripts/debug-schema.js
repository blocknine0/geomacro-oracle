// scripts/debug-schema.js
// Run once to see events table columns and a sample row
// node scripts/debug-schema.js

import { createClient } from "@supabase/supabase-js";

const { APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY } = process.env;

if (!APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY) {
  throw new Error("Missing APP_SUPABASE_URL or APP_SUPABASE_ANON_KEY");
}

const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);

const { data, error } = await supabase
  .from("events")
  .select("*")
  .limit(3);

if (error) {
  console.error("Supabase error:", error.message);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log("No rows found in events table.");
  process.exit(0);
}

console.log("=== COLUMNS ===");
console.log(Object.keys(data[0]).join("\n"));

console.log("\n=== SAMPLE ROW ===");
console.log(JSON.stringify(data[0], null, 2));

console.log("\n=== ALL 3 ROWS (key fields only) ===");
for (const row of data) {
  console.log({
    id: row.id,
    status: row.status,
    market_resolved: row.market_resolved,
    resolved_at: row.resolved_at,
    resolution_at: row.resolution_at,
    created_at: row.created_at,
  });
}
