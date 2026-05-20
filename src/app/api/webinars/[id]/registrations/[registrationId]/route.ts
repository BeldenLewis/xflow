import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

interface RegistrationPatch {
  name?: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  industry?: string | null;
  agreeMarketing?: boolean;
  agreePrivacy?: boolean;
  memo?: string | null;
}

async function authorize(webinarId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
  if (!webinar) return { error: NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 }) };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return { error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) };

  return { error: null };
}

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizePhone(value: unknown) {
  const text = String(value ?? "").replace(/[^0-9]/g, "");
  return text || null;
}

function normalizeEmail(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; registrationId: string }> }
) {
  const { id, registrationId } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;

  const registration = await prisma.webinarRegistration.findFirst({
    where: { id: registrationId, webinarId: id },
    select: { id: true },
  });

  if (!registration) {
    return NextResponse.json({ error: "등록자를 찾지 못했어요" }, { status: 404 });
  }

  const body = await request.json() as RegistrationPatch;
  const name = String(body.name ?? "").trim();
  const phone = normalizePhone(body.phone);
  const email = normalizeEmail(body.email);

  if (!name) return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
  if (!phone && !email) return NextResponse.json({ error: "연락처 또는 이메일이 필요합니다." }, { status: 400 });

  const updated = await prisma.webinarRegistration.update({
    where: { id: registration.id },
    data: {
      name,
      phone,
      email,
      company: clean(body.company),
      department: clean(body.department),
      jobTitle: clean(body.jobTitle),
      industry: clean(body.industry),
      agreeMarketing: Boolean(body.agreeMarketing),
      agreePrivacy: body.agreePrivacy !== false,
      memo: clean(body.memo),
    },
  });

  return NextResponse.json({ registration: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; registrationId: string }> }
) {
  const { id, registrationId } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;

  const registration = await prisma.webinarRegistration.findFirst({
    where: { id: registrationId, webinarId: id },
    select: { id: true },
  });

  if (!registration) {
    return NextResponse.json({ error: "등록자를 찾지 못했어요" }, { status: 404 });
  }

  await prisma.webinarRegistration.delete({ where: { id: registration.id } });

  return NextResponse.json({ ok: true });
}
