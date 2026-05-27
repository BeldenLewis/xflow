import "dotenv/config";
import { config } from "dotenv";
import pg from "pg";
config({ path: ".env.local" });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const SOURCE_ALIASES = {
  GOOGLE: ["google", "google_ads", "googleads", "g", "gads"],
  META: ["meta", "facebook", "fb", "instagram", "ig", "fbads", "facebook_ads"],
  LINKEDIN: ["linkedin", "li", "linkedin_ads"],
};
const norm = (v) => (v ?? "").trim().toLowerCase();

console.log("=== 매체 단위 CAC 시뮬레이션 ===\n");
for (const channel of ["GOOGLE", "META", "LINKEDIN"]) {
  const ad = await client.query(`SELECT SUM(cost)::int as cost, SUM(clicks)::int as clicks, SUM(impressions)::int as imp FROM "AdPerformanceRecord" WHERE "sourceType" = $1`, [channel]);
  const aliases = SOURCE_ALIASES[channel];
  const collect = await client.query(`SELECT COUNT(*)::int as cnt FROM "CollectRecord" WHERE LOWER(TRIM("utmSource")) = ANY($1)`, [aliases]);
  const cost = ad.rows[0].cost ?? 0;
  const clicks = ad.rows[0].clicks ?? 0;
  const regs = collect.rows[0].cnt;
  const cac = regs > 0 ? Math.round(cost / regs) : null;
  console.log(`${channel}: 광고비 ${cost.toLocaleString()}원 / 등록 ${regs}건 → CAC ${cac ? cac.toLocaleString() + "원" : "-"}`);
}

await client.end();
