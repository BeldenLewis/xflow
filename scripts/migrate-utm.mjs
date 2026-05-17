import pg from "pg";

const client = new pg.Client({
  connectionString: "postgresql://postgres.ytfjlegolgfycowfxivd:flsfl549603@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

const sql = `
CREATE TABLE IF NOT EXISTS "UTMLink" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "name"        TEXT,
  "url"         TEXT NOT NULL,
  "utmSource"   TEXT NOT NULL,
  "utmMedium"   TEXT NOT NULL,
  "utmCampaign" TEXT NOT NULL,
  "utmTerm"     TEXT,
  "utmContent"  TEXT,
  "fullUrl"     TEXT NOT NULL,
  "shortUrl"    TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UTMLink_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UTMLink"
  ADD CONSTRAINT "UTMLink_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UTMLink"
  ADD CONSTRAINT "UTMLink_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

try {
  await client.connect();
  console.log("✓ Supabase 연결");
  await client.query(sql);
  console.log("✓ UTMLink 테이블 생성 완료");
} catch (err) {
  console.error("✗ 실패:", err.message);
} finally {
  await client.end();
}
