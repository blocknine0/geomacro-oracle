// scripts/debug-schema.js
//
// পারপাস: কোডে যেই কলাম নামগুলো ব্যবহার করা হচ্ছে (ingest-news.js, create-markets.js,
// resolve-markets.js), সেগুলো আসলেই লাইভ Supabase 'events' টেবিলে আছে কিনা যাচাই করা।
// এটা schema drift ধরার জন্য — যেন "null value in column X violates not-null constraint"
// টাইপ এরর প্রোডাকশনে গিয়ে ধরা না পড়ে, বরং এই ডিবাগ স্ক্রিপ্ট দিয়ে আগেই ধরা যায়।

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const { APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY } = process.env;

if (!APP_SUPABASE_URL || !APP_SUPABASE_ANON_KEY) {
  console.error("❌ Missing APP_SUPABASE_URL or APP_SUPABASE_ANON_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY);

// কোডের বিভিন্ন স্ক্রিপ্টে যেই কলামগুলো এক্সপেক্ট করা হয়, সেগুলোর লিস্ট —
// নতুন কোনো ফিল্ড কোডে ব্যবহার করলে এখানে যোগ করে দিলেই debug script আপডেট থাকবে।
const EXPECTED_COLUMNS = {
  'ingest-news.js (insert)': [
    'source_url', 'source_title', 'source_name', 'category', 'narrative',
    'summary', 'stage', 'severity', 'confidence', 'delta', 'published_at',
    'market_created', 'created_at'
  ],
  'ingest-news.js (dedupe select)': ['source_url', 'source_title'],
  'create-markets.js (select)': ['id', 'source_title', 'category', 'severity', 'created_at', 'market_created'],
  'create-markets.js (update)': ['market_created', 'market_threshold', 'resolution_at', 'market_address'],
  'resolve-markets.js (select)': ['id', 'market_created', 'market_resolved', 'resolution_at'],
  'resolve-markets.js (update)': ['market_resolved', 'ai_processed', 'ai_tentative_winner', 'ai_resolved_at'],
};

async function main() {
  console.log("🔍 Fetching a sample row from 'events' to detect live schema...\n");

  const { data, error } = await supabase.from('events').select('*').limit(1);

  if (error) {
    console.error("❌ Failed to query 'events' table:", error.message);
    console.error("   (This could mean RLS is blocking anon key reads, or the table/columns don't exist.)");
    process.exit(1);
  }

  let liveColumns;
  if (data && data.length > 0) {
    liveColumns = new Set(Object.keys(data[0]));
    console.log(`✅ Sample row found. Live columns detected (${liveColumns.size}):`);
    console.log('   ' + [...liveColumns].sort().join(', '));
  } else {
    console.log("⚠️ 'events' table is empty — cannot infer columns from a row.");
    console.log("   Run this after at least one row exists, or check schema manually in SQL Editor:");
    console.log(`
   SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_name = 'events'
   ORDER BY ordinal_position;
    `);
    process.exit(0);
  }

  console.log("\n🔎 Checking expected columns per script against live schema...\n");

  let anyMismatch = false;

  for (const [scriptName, expectedCols] of Object.entries(EXPECTED_COLUMNS)) {
    const missing = expectedCols.filter(c => !liveColumns.has(c));
    if (missing.length > 0) {
      anyMismatch = true;
      console.log(`❌ ${scriptName}: MISSING columns → ${missing.join(', ')}`);
    } else {
      console.log(`✅ ${scriptName}: all expected columns present`);
    }
  }

  console.log("\n" + (anyMismatch
    ? "⚠️ Schema drift detected — fix missing columns above before running related scripts."
    : "🎉 No schema drift detected. All script-expected columns exist in the live table."));
}

main().catch(err => {
  console.error("❌ Unexpected error:", err.message);
  process.exit(1);
});
