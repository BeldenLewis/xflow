import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400, headers: CORS_HEADERS });
  }

  const apiKey = request.headers.get("x-api-key") ?? (body.apiKey as string);
  if (!apiKey) {
    return NextResponse.json({ error: "API 키 필요" }, { status: 401, headers: CORS_HEADERS });
  }

  const source = await prisma.collectSource.findUnique({
    where: { apiKey },
    include: { fieldMappings: { orderBy: { sortOrder: "asc" } } },
  });

  if (!source || !source.isActive) {
    return NextResponse.json({ error: "유효하지 않은 API 키" }, { status: 401, headers: CORS_HEADERS });
  }

  const {
    data, _fieldMeta,
    utmSource, utmMedium, utmCampaign, utmTerm, utmContent,
    referrer, userAgent,
  } = body as {
    data: Record<string, string>;
    _fieldMeta?: Array<{ index: number; label: string; type: string }>;
    utmSource?: string; utmMedium?: string; utmCampaign?: string;
    utmTerm?: string; utmContent?: string;
    referrer?: string; userAgent?: string;
  };

  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "data 필드 필요" }, { status: 400, headers: CORS_HEADERS });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null;

  const recordData = {
    sourceId: source.id,
    projectId: source.projectId,
    workspaceId: source.workspaceId,
    data,
    utmSource: utmSource ?? null,
    utmMedium: utmMedium ?? null,
    utmCampaign: utmCampaign ?? null,
    utmTerm: utmTerm ?? null,
    utmContent: utmContent ?? null,
    referrer: referrer ?? null,
    userAgent: userAgent ?? null,
    ip,
  };

  let recordId: string;

  if (Array.isArray(_fieldMeta) && _fieldMeta.length > 0) {
    const [record] = await prisma.$transaction([
      prisma.collectRecord.create({ data: recordData }),
      prisma.collectSource.update({
        where: { id: source.id },
        data: { discoveredFields: _fieldMeta },
      }),
    ]);
    recordId = record.id;
  } else {
    const record = await prisma.collectRecord.create({ data: recordData });
    recordId = record.id;
  }

  return NextResponse.json({ ok: true, id: recordId }, { status: 201, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
