import "dotenv/config";
import { config } from "dotenv";
import pg from "pg";
config({ path: ".env.local" });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

console.log("=== 광고 데이터 (sourceType + campaignName) — 상위 10개 ===");
const ad = await client.query(`
  SELECT "sourceType", "campaignName", COUNT(*) as records, SUM(cost)::int as cost, SUM(clicks)::int as clicks
  FROM "AdPerformanceRecord"
  GROUP BY "sourceType", "campaignName"
  ORDER BY SUM(cost) DESC NULLS LAST
  LIMIT 10
`);
for (const r of ad.rows) console.log(` - ${r.sourceType} | "${r.campaignName}" | 비용 ${r.cost}원 | 클릭 ${r.clicks}`);

console.log("\n=== 사전등록 UTM 분포 — 상위 10개 ===");
const collect = await client.query(`
  SELECT "utmSource", "utmMedium", "utmCampaign", COUNT(*) as cnt
  FROM "CollectRecord"
  WHERE "utmSource" IS NOT NULL OR "utmCampaign" IS NOT NULL
  GROUP BY "utmSource", "utmMedium", "utmCampaign"
  ORDER BY COUNT(*) DESC
  LIMIT 10
`);
for (const r of collect.rows) console.log(` - "${r.utmSource}" / "${r.utmMedium}" / "${r.utmCampaign}" : ${r.cnt}건`);

console.log("\n=== UTM 없는 사전등록 ===");
const noUtm = await client.query(`SELECT COUNT(*) as cnt FROM "CollectRecord" WHERE "utmSource" IS NULL AND "utmCampaign" IS NULL`);
console.log(` - 다이렉트 ${noUtm.rows[0].cnt}건`);

await client.end();
