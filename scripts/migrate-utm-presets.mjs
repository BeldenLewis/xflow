import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS "UTMPreset" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "field"       TEXT NOT NULL,
    "value"       TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UTMPreset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UTMPreset_workspaceId_field_value_key" UNIQUE ("workspaceId", "field", "value"),
    CONSTRAINT "UTMPreset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
  );
`);

await client.query(`
  CREATE TABLE IF NOT EXISTS "UTMTemplate" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "source"      TEXT NOT NULL,
    "medium"      TEXT NOT NULL,
    "campaign"    TEXT,
    "term"        TEXT,
    "content"     TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UTMTemplate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UTMTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
  );
`);

console.log("✅ UTMPreset, UTMTemplate 테이블 생성 완료");
await client.end();
