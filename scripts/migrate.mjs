import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "../supabase/migrations/init.sql"), "utf-8");

const client = new pg.Client({
  connectionString: "postgresql://postgres.ytfjlegolgfycowfxivd:flsfl549603@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("✓ Connected to Supabase");
  await client.query(sql);
  console.log("✓ Migration applied successfully");
} catch (err) {
  console.error("✗ Migration failed:", err.message);
} finally {
  await client.end();
}
