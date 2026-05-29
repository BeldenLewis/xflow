import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";

function normalizePhone(value: unknown) {
  const text = String(value ?? "").replace(/[^0-9]/g, "");
  return text || null;
}

function normalizeEmail(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || null;
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // 공개 엔드포인트 — 전화번호/이메일 무차별 대입으로 명단 enumeration 방지
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`verify:${slug}:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString(),
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const body = await request.json();
  const { type, value } = body;

  if (!type || !value) {
    return NextResponse.json({ found: false, registration: null }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const normalizedValue = type === "phone" ? normalizePhone(value) : normalizeEmail(value);
  if (!normalizedValue) {
    return NextResponse.json({ found: false, registration: null }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const where =
    type === "phone"
      ? { webinarId: webinar.id, phone: normalizedValue }
      : { webinarId: webinar.id, email: normalizedValue };

  // 입장 확인엔 이름만 있으면 충분 — PII(email/phone/company/department/jobTitle/industry) 미반환
  const registration = await prisma.webinarRegistration.findFirst({
    where,
    select: { id: true, name: true },
  });

  return NextResponse.json(
    { found: !!registration, registration: registration ?? null },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
