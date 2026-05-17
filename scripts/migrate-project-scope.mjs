import pg from "pg";

const client = new pg.Client({
  connectionString: "postgresql://postgres.ytfjlegolgfycowfxivd:flsfl549603@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

const sql = `
-- UTMLink에 projectId 추가
ALTER TABLE "UTMLink" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

-- 기존 데이터가 있으면 null 허용 (새 레코드는 required)
-- Project 테이블 FK
ALTER TABLE "UTMLink"
  DROP CONSTRAINT IF EXISTS "UTMLink_projectId_fkey";

ALTER TABLE "UTMLink"
  ADD CONSTRAINT "UTMLink_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

try {
  await client.connect();
  console.log("✓ 연결됨");
  await client.query(sql);
  console.log("✓ UTMLink에 projectId 컬럼 추가 완료");
} catch (err) {
  console.error("✗ 실패:", err.message);
} finally {
  await client.end();
}
