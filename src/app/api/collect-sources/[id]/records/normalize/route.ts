import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

type NormalizeOp = "trim" | "lowercase_email" | "phone_digits";

interface NormalizeBody {
  ops: NormalizeOp[];
  fields?: string[]; // 적용할 필드 키 (없으면 전체 필드)
  dryRun?: boolean;
}

function applyOps(value: string, ops: NormalizeOp[], isEmail: boolean, isPhone: boolean): string {
  let v = value;
  if (ops.includes("trim")) v = v.trim();
  if (ops.includes("lowercase_email") && isEmail) v = v.toLowerCase();
  if (ops.includes("phone_digits") && isPhone) v = v.replace(/\D/g, "");
  return v;
}

// 필드명/라벨로 이메일/전화 컬럼 추정
function classifyField(key: string, label: string): { isEmail: boolean; isPhone: boolean } {
  const k = (key + " " + label).toLowerCase();
  return {
    isEmail: /(email|mail|이메일|메일)/.test(k),
    isPhone: /(phone|mobile|tel|휴대폰|전화|연락처|핸드폰)/.test(k),
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({
    where: { id },
    include: { fieldMappings: true },
  });
  if (!source) return NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });
  if (membership.role === "MEMBER") return NextResponse.json({ error: "권한 없음 (ADMIN 이상)" }, { status: 403 });

  const body: NormalizeBody = await request.json().catch(() => ({ ops: [] } as NormalizeBody));
  const ops: NormalizeOp[] = Array.isArray(body.ops) ? body.ops : [];
  if (ops.length === 0) {
    return NextResponse.json({ error: "작업(ops)을 하나 이상 선택해주세요" }, { status: 400 });
  }
  const targetFields = Array.isArray(body.fields) && body.fields.length > 0
    ? new Set(body.fields)
    : null; // null = 전체

  const fieldInfo = new Map<string, { isEmail: boolean; isPhone: boolean; label: string }>();
  for (const f of source.fieldMappings) {
    const c = classifyField(f.key, f.label);
    fieldInfo.set(f.key, { ...c, label: f.label });
  }

  const records = await prisma.collectRecord.findMany({
    where: { sourceId: id },
    select: { id: true, data: true },
  });

  let changedRows = 0;
  let changedCells = 0;
  const updates: { id: string; data: Record<string, string> }[] = [];

  for (const r of records) {
    const data = (r.data ?? {}) as Record<string, string>;
    const next: Record<string, string> = { ...data };
    let rowChanged = false;

    for (const [k, v] of Object.entries(data)) {
      if (targetFields && !targetFields.has(k)) continue;
      if (typeof v !== "string") continue;
      const info = fieldInfo.get(k) ?? { isEmail: false, isPhone: false, label: k };
      const nv = applyOps(v, ops, info.isEmail, info.isPhone);
      if (nv !== v) {
        next[k] = nv;
        rowChanged = true;
        changedCells++;
      }
    }

    if (rowChanged) {
      changedRows++;
      updates.push({ id: r.id, data: next });
    }
  }

  if (body.dryRun) {
    return NextResponse.json({ changedRows, changedCells, applied: 0, dryRun: true });
  }

  // 청크 업데이트
  const CHUNK = 200;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((u) =>
        prisma.collectRecord.update({
          where: { id: u.id },
          data: { data: u.data },
        }),
      ),
    );
  }

  await logActivity({
    workspaceId: source.workspaceId,
    sourceId: source.id,
    userId: user.id,
    action: "records.normalized",
    meta: { ops, changedRows, changedCells, fields: Array.from(targetFields ?? []) },
  });

  return NextResponse.json({ changedRows, changedCells, applied: changedRows });
}
