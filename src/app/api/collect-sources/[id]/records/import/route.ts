import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

interface ImportRecord {
  data?: Record<string, string>;
  createdAt?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  referrer?: string | null;
}

type DedupMode = "skip" | "all" | "merge";

// 같은 소스 내에서 data(키 정렬) 가 일치하면 동일 레코드로 간주 (skip 모드용).
// createdAt 은 시그니처에 포함하지 않음 — 엑셀/CSV 재내보내기 시 ms·초 단위 정밀도 손실로 매칭 실패하는 문제 회피.
// 같은 데이터를 의도적으로 여러 번 넣고 싶다면 "모두 추가" 모드를 사용하세요.
function signatureOf(_createdAt: Date | string | null | undefined, data: unknown): string {
  const obj = (data && typeof data === "object") ? data as Record<string, unknown> : {};
  const sortedKeys = Object.keys(obj).sort();
  const normalized = sortedKeys.map((k) => [k, obj[k] == null ? "" : String(obj[k]).trim().toLowerCase()]);
  return JSON.stringify(normalized);
}

function normalizeKey(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim().toLowerCase();
}

function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const records: unknown = body?.records;
  const mode: DedupMode = body?.mode === "all" ? "all" : body?.mode === "merge" ? "merge" : "skip";
  const keyField: string | undefined = typeof body?.keyField === "string" ? body.keyField : undefined;

  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: "가져올 레코드가 없어요" }, { status: 400 });
  }
  if (records.length > 100000) {
    return NextResponse.json({ error: "한 번에 최대 100,000건까지 가져올 수 있어요" }, { status: 400 });
  }
  if (mode === "merge" && !keyField) {
    return NextResponse.json({ error: "업데이트 모드에는 기준 필드(keyField)가 필요해요" }, { status: 400 });
  }

  const rows = (records as ImportRecord[]).map((r) => {
    let createdAt: Date | undefined;
    if (r.createdAt) {
      const d = new Date(r.createdAt);
      if (!isNaN(d.getTime())) createdAt = d;
    }
    return {
      sourceId: source.id,
      projectId: source.projectId,
      workspaceId: source.workspaceId,
      data: (r.data ?? {}) as Record<string, string>,
      utmSource: r.utmSource ?? null,
      utmMedium: r.utmMedium ?? null,
      utmCampaign: r.utmCampaign ?? null,
      utmTerm: r.utmTerm ?? null,
      utmContent: r.utmContent ?? null,
      referrer: r.referrer ?? null,
      createdAt,
    };
  });

  // ──────────────────────────────────────────────
  // merge 모드: 기준 필드로 기존 레코드 찾아서 비어있지 않은 컬럼만 덮어쓰기
  // ──────────────────────────────────────────────
  if (mode === "merge") {
    const existing = await prisma.collectRecord.findMany({
      where: { sourceId: source.id },
      select: {
        id: true, data: true, createdAt: true,
        utmSource: true, utmMedium: true, utmCampaign: true, utmTerm: true, utmContent: true, referrer: true,
      },
    });

    // 기준 필드 값 → 매칭되는 기존 레코드 ID들
    const keyIndex = new Map<string, string[]>();
    for (const e of existing) {
      const data = (e.data ?? {}) as Record<string, unknown>;
      const k = normalizeKey(data[keyField!]);
      if (!k) continue;
      if (!keyIndex.has(k)) keyIndex.set(k, []);
      keyIndex.get(k)!.push(e.id);
    }
    const existingById = new Map(existing.map((e) => [e.id, e]));

    let inserted = 0;
    let updated = 0;
    const toInsert: typeof rows = [];
    const updates: Array<{ id: string; data: Record<string, string>; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmTerm: string | null; utmContent: string | null; referrer: string | null }> = [];

    for (const row of rows) {
      const k = normalizeKey(row.data[keyField!]);
      const matched = k ? keyIndex.get(k) : undefined;

      if (!matched || matched.length === 0) {
        toInsert.push(row);
        continue;
      }

      // 매칭되는 모든 기존 레코드에 머지 (data + utm/referrer, createdAt 은 보존)
      for (const targetId of matched) {
        const target = existingById.get(targetId)!;
        const mergedData: Record<string, string> = { ...((target.data ?? {}) as Record<string, string>) };
        for (const [fk, fv] of Object.entries(row.data)) {
          if (isNonEmpty(fv)) mergedData[fk] = fv;
        }
        updates.push({
          id: targetId,
          data: mergedData,
          utmSource: isNonEmpty(row.utmSource) ? row.utmSource : target.utmSource,
          utmMedium: isNonEmpty(row.utmMedium) ? row.utmMedium : target.utmMedium,
          utmCampaign: isNonEmpty(row.utmCampaign) ? row.utmCampaign : target.utmCampaign,
          utmTerm: isNonEmpty(row.utmTerm) ? row.utmTerm : target.utmTerm,
          utmContent: isNonEmpty(row.utmContent) ? row.utmContent : target.utmContent,
          referrer: isNonEmpty(row.referrer) ? row.referrer : target.referrer,
        });
        // 다음 업로드 행이 같은 키로 와도 위에서 머지한 결과를 누적해야 함
        existingById.set(targetId, { ...target, data: mergedData });
      }
    }

    // 업데이트 실행 (개별 row 업데이트 — 트랜잭션 청크)
    const UPDATE_CHUNK = 200;
    for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
      const chunk = updates.slice(i, i + UPDATE_CHUNK);
      await prisma.$transaction(
        chunk.map((u) =>
          prisma.collectRecord.update({
            where: { id: u.id },
            data: {
              data: u.data,
              utmSource: u.utmSource,
              utmMedium: u.utmMedium,
              utmCampaign: u.utmCampaign,
              utmTerm: u.utmTerm,
              utmContent: u.utmContent,
              referrer: u.referrer,
            },
          }),
        ),
      );
      updated += chunk.length;
    }

    // 키가 매칭 안 된 행은 새로 insert
    const insertRows = toInsert.map((r) => ({
      sourceId: r.sourceId,
      projectId: r.projectId,
      workspaceId: r.workspaceId,
      data: r.data,
      utmSource: r.utmSource,
      utmMedium: r.utmMedium,
      utmCampaign: r.utmCampaign,
      utmTerm: r.utmTerm,
      utmContent: r.utmContent,
      referrer: r.referrer,
      ...(r.createdAt ? { createdAt: r.createdAt } : {}),
    }));
    const INSERT_CHUNK = 2000;
    for (let i = 0; i < insertRows.length; i += INSERT_CHUNK) {
      const result = await prisma.collectRecord.createMany({ data: insertRows.slice(i, i + INSERT_CHUNK) });
      inserted += result.count;
    }

    await logActivity({
      workspaceId: source.workspaceId,
      sourceId: source.id,
      userId: user.id,
      action: "records.imported",
      meta: { mode: "merge", inserted, updated, keyField },
    });

    return NextResponse.json({ imported: inserted, updated, skipped: 0 });
  }

  // ──────────────────────────────────────────────
  // skip / all 모드
  // ──────────────────────────────────────────────
  const insertableRows = rows.map((r) => ({
    sourceId: r.sourceId,
    projectId: r.projectId,
    workspaceId: r.workspaceId,
    data: r.data,
    utmSource: r.utmSource,
    utmMedium: r.utmMedium,
    utmCampaign: r.utmCampaign,
    utmTerm: r.utmTerm,
    utmContent: r.utmContent,
    referrer: r.referrer,
    ...(r.createdAt ? { createdAt: r.createdAt } : {}),
  }));

  let toInsert = insertableRows;
  let skipped = 0;

  if (mode === "skip") {
    const existing = await prisma.collectRecord.findMany({
      where: { sourceId: source.id },
      select: { createdAt: true, data: true },
    });
    const existingSigs = new Set(existing.map((e) => signatureOf(e.createdAt, e.data)));

    const seenInBatch = new Set<string>();
    toInsert = [];
    for (const row of insertableRows) {
      const sig = signatureOf(row.createdAt ?? null, row.data);
      if (existingSigs.has(sig) || seenInBatch.has(sig)) {
        skipped++;
        continue;
      }
      seenInBatch.add(sig);
      toInsert.push(row);
    }
  }

  const CHUNK_SIZE = 2000;
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const result = await prisma.collectRecord.createMany({ data: chunk });
    imported += result.count;
  }

  await logActivity({
    workspaceId: source.workspaceId,
    sourceId: source.id,
    userId: user.id,
    action: "records.imported",
    meta: { mode, imported, skipped },
  });

  return NextResponse.json({ imported, skipped, updated: 0 });
}
