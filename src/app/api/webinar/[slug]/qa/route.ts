import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const questions = await prisma.webinarQA.findMany({
    where: { webinarId: webinar.id, status: "answered" },
    orderBy: { createdAt: "asc" },
    select: { id: true, question: true, name: true, status: true, createdAt: true },
  });

  return NextResponse.json({ questions }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const webinar = await prisma.webinar.findUnique({ where: { slug } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const now = new Date();
  const isLive = now >= new Date(webinar.liveStartAt) && now <= new Date(webinar.liveEndAt);
  if (!isLive) {
    return NextResponse.json({ error: "라이브 중에만 질문을 남길 수 있어요" }, { status: 400 });
  }

  const body = await request.json();
  const { question, sessionNumber, name, company, phone, email } = body;

  if (!question?.trim()) {
    return NextResponse.json({ error: "질문 내용을 입력해주세요" }, { status: 400 });
  }

  const qa = await prisma.webinarQA.create({
    data: {
      webinarId: webinar.id,
      question: question.trim(),
      sessionNumber: sessionNumber ?? null,
      name: name?.trim() || null,
      company: company?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
    },
  });

  return NextResponse.json({ qa: { id: qa.id } }, {
    status: 201,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
