import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  const registration = await prisma.webinarRegistration.findFirst({
    where,
    select: { id: true, name: true, email: true, phone: true, company: true, department: true, jobTitle: true, industry: true },
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
