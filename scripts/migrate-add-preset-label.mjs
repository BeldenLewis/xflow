import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
await client.query(`ALTER TABLE "UTMPreset" ADD COLUMN IF NOT EXISTS "label" TEXT;`);
console.log("✅ UTMPreset.label 컬럼 추가 완료");
await client.end();
