import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { id } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const registrations = await prisma.webinarRegistration.findMany({
    where: { webinarId: id },
    orderBy: { submittedAt: "desc" },
  });

  const headers = ["이름", "연락처", "이메일", "회사", "부서", "직함", "업종", "마케팅동의", "체류시간(분)", "등록일", "입장일"];
  const rows = registrations.map((r) => [
    r.name,
    r.phone ?? "",
    r.email ?? "",
    r.company ?? "",
    r.department ?? "",
    r.jobTitle ?? "",
    r.industry ?? "",
    r.agreeMarketing ? "Y" : "N",
    String(r.stayMinutes),
    new Date(r.submittedAt).toLocaleString("ko-KR"),
    r.enteredAt ? new Date(r.enteredAt).toLocaleString("ko-KR") : "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registrations-${webinar.slug}.csv"`,
    },
  });
}
