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

const normCampaign = (v) => (v ?? "").trim().toLowerCase().replace(/[\s\-_]+/g, "");
const norm = (v) => (v ?? "").trim().toLowerCase();

// Ad 캠페인들
const ad = await client.query(`SELECT "sourceType", "campaignName", SUM(cost)::int as cost FROM "AdPerformanceRecord" GROUP BY "sourceType", "campaignName" ORDER BY SUM(cost) DESC NULLS LAST`);

// Collect groups
const collect = await client.query(`SELECT "utmSource", "utmCampaign", COUNT(*)::int as cnt FROM "CollectRecord" WHERE "utmSource" IS NOT NULL OR "utmCampaign" IS NOT NULL GROUP BY "utmSource", "utmCampaign"`);

const lookup = new Map();
for (const r of collect.rows) {
  const src = norm(r.utmSource);
  const camp = normCampaign(r.utmCampaign);
  if (!src && !camp) continue;
  const k = `${src}||${camp}`;
  lookup.set(k, (lookup.get(k) ?? 0) + r.cnt);
}

console.log("=== 광고 캠페인별 매칭 결과 ===");
let matched = 0, total = 0;
for (const r of ad.rows) {
  const aliases = SOURCE_ALIASES[r.sourceType] ?? [r.sourceType.toLowerCase()];
  const nc = normCampaign(r.campaignName);
  let regs = 0;
  for (const a of aliases) regs += lookup.get(`${a}||${nc}`) ?? 0;
  if (regs > 0) matched++;
  total++;
  const status = regs > 0 ? "✅" : "❌";
  console.log(`${status} ${r.sourceType} | "${r.campaignName}" (norm: ${nc || "(empty)"}) → 매칭 ${regs}건 | 비용 ${r.cost?.toLocaleString()}원`);
}
console.log(`\n총 ${total}개 캠페인 중 ${matched}개 매칭됨`);

await client.end();
