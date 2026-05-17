import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const link = await prisma.uTMLink.findFirst({ where: { id, createdById: user.id } });
  if (!link) return NextResponse.json({ error: "찾을 수 없어요" }, { status: 404 });

  const { shortUrl, name, url, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, fullUrl } = body;

  const updated = await prisma.uTMLink.update({
    where: { id },
    data: {
      ...(shortUrl !== undefined && { shortUrl }),
      ...(name !== undefined && { name: name || null }),
      ...(url !== undefined && { url }),
      ...(utmSource !== undefined && { utmSource }),
      ...(utmMedium !== undefined && { utmMedium }),
      ...(utmCampaign !== undefined && { utmCampaign }),
      ...(utmTerm !== undefined && { utmTerm: utmTerm || null }),
      ...(utmContent !== undefined && { utmContent: utmContent || null }),
      ...(fullUrl !== undefined && { fullUrl }),
    },
  });

  return NextResponse.json({ utmLink: updated });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (membership?.role === "MEMBER") {
    return NextResponse.json({ error: "뷰어는 UTM을 삭제할 수 없어요." }, { status: 403 });
  }

  await prisma.uTMLink.deleteMany({ where: { id, createdById: user.id } });
  return NextResponse.json({ ok: true });
}
