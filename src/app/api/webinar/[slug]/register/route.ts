import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RegistrationField {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  enabled?: boolean;
  system?: boolean;
}

const defaultFields: RegistrationField[] = [
  { key: "name", label: "이름", required: true, enabled: true, system: true },
  { key: "phone", label: "연락처", required: false, enabled: true, system: true },
  { key: "email", label: "이메일", required: false, enabled: true, system: true },
  { key: "company", label: "회사명", required: false, enabled: true, system: true },
  { key: "department", label: "부서", required: false, enabled: true, system: true },
  { key: "jobTitle", label: "직함", required: false, enabled: true, system: true },
  { key: "industry", label: "업종", required: false, enabled: true, system: true },
];

function getRegistrationFields(config: unknown): RegistrationField[] {
  const raw = config as { registrationForm?: { fields?: RegistrationField[] } } | null;
  const savedFields = Array.isArray(raw?.registrationForm?.fields) ? raw.registrationForm.fields : [];
  const merged = defaultFields.map((field) => ({
    ...field,
    ...savedFields.find((item) => item?.key === field.key),
    key: field.key,
    system: true,
  }));
  const customFields = savedFields
    .filter((item) => item && !defaultFields.some((field) => field.key === item.key))
    .map((item) => ({
      ...item,
      key: String(item.key),
      label: String(item.label ?? item.key),
      enabled: item.enabled !== false,
      required: Boolean(item.required),
      system: false,
    }));
  return [...merged, ...customFields].filter((field) => field.enabled !== false);
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

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const webinar = await prisma.webinar.findUnique({ where: { slug } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const now = new Date();
  if (now > new Date(webinar.signupDeadline)) {
    return NextResponse.json({ error: "사전등록이 마감됐어요" }, { status: 400 });
  }

  const body = await request.json();
  const { name, phone, email, company, department, jobTitle, industry, agreeMarketing, agreePrivacy, memo, customFields } = body;
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = normalizeEmail(email);
  const fields = getRegistrationFields(webinar.config);
  const customAnswers = typeof customFields === "object" && customFields !== null ? customFields as Record<string, unknown> : {};

  for (const field of fields) {
    if (!field.required) continue;
    const value = field.system ? body[field.key] : customAnswers[field.key];
    if (field.type === "checkbox") {
      if (!value) return NextResponse.json({ error: `${field.label} 항목에 동의해주세요` }, { status: 400 });
    } else if (String(value ?? "").trim() === "") {
      return NextResponse.json({ error: `${field.label} 항목을 입력해주세요` }, { status: 400 });
    }
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
  }
  if (!normalizedPhone && !normalizedEmail) {
    return NextResponse.json({ error: "입장 확인을 위해 연락처 또는 이메일 중 하나를 입력해주세요" }, { status: 400 });
  }

  const memoPayload = {
    ...(memo?.trim() ? { memo: memo.trim() } : {}),
    ...(Object.keys(customAnswers).length ? { customFields: customAnswers } : {}),
  };

  const duplicate = await prisma.webinarRegistration.findFirst({
    where: {
      webinarId: webinar.id,
      OR: [
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
      ],
    },
    orderBy: { submittedAt: "asc" },
  });

  if (duplicate) {
    const registration = await prisma.webinarRegistration.update({
      where: { id: duplicate.id },
      data: {
        name: name.trim(),
        phone: normalizedPhone,
        email: normalizedEmail,
        company: clean(company),
        department: clean(department),
        jobTitle: clean(jobTitle),
        industry: clean(industry),
        agreeMarketing: Boolean(agreeMarketing),
        agreePrivacy: Boolean(agreePrivacy ?? true),
        memo: Object.keys(memoPayload).length ? JSON.stringify(memoPayload, null, 2) : duplicate.memo,
      },
    });

    return NextResponse.json({
      alreadyRegistered: true,
      registration: { id: registration.id, name: registration.name, email: registration.email, phone: registration.phone },
    }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const registration = await prisma.webinarRegistration.create({
    data: {
      webinarId: webinar.id,
      name: name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      company: clean(company),
      department: clean(department),
      jobTitle: clean(jobTitle),
      industry: clean(industry),
      agreeMarketing: Boolean(agreeMarketing),
      agreePrivacy: Boolean(agreePrivacy ?? true),
      memo: Object.keys(memoPayload).length ? JSON.stringify(memoPayload, null, 2) : null,
    },
  });

  return NextResponse.json({ registration: { id: registration.id, name: registration.name, email: registration.email, phone: registration.phone } }, {
    status: 201,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
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
