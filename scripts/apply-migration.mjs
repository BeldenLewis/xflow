import "dotenv/config";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import pg from "pg";

// .env.local 우선 로드
config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 환경변수가 없어요");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-migration.mjs <sql-file>");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  console.log(`Applying ${file}...`);
  await client.query(sql);
  console.log("✓ Applied");
} catch (e) {
  console.error("✗ Failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
