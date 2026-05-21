import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// 사이트 URL 을 fetch 해서 스크립트가 설치돼있는지 점검.
// 점검 항목:
//  - 사이트 응답 도달 가능 여부
//  - HTML 에 우리 collect URL / API 키 포함 여부 (직접 인라인된 경우)
//  - HTML 에 우리 source ID 가 보이는지 (보조 시그널)
//
// 주의: 아임웹은 사용자 정의 코드를 페이지에 직접 인라인하므로 보통 HTML 에 나타남.
//      외부 .js 파일로 빼서 src 로 로드한 경우엔 탐지 불가 → '판단 불가' 응답.
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

  const result: {
    siteUrl: string | null;
    siteReachable: boolean;
    statusCode: number | null;
    scriptDetected: "yes" | "no" | "unknown";
    apiKeyDetected: boolean;
    collectUrlDetected: boolean;
    hint: string;
  } = {
    siteUrl: source.siteUrl,
    siteReachable: false,
    statusCode: null,
    scriptDetected: "unknown",
    apiKeyDetected: false,
    collectUrlDetected: false,
    hint: "",
  };

  if (!source.siteUrl) {
    result.hint = "소스에 사이트 URL이 등록돼있지 않아요. 필드 설정에서 사이트 URL을 입력하면 자동 검증할 수 있어요.";
    return NextResponse.json(result);
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(source.siteUrl, {
      headers: { "User-Agent": "mach-installation-checker/1.0" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(timer);

    result.statusCode = res.status;
    result.siteReachable = res.ok || res.status < 500;

    if (res.ok) {
      const html = await res.text();
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
      const collectUrl = `${baseUrl.replace(/\/+$/, "")}/api/collect`;

      result.apiKeyDetected = html.includes(source.apiKey);
      result.collectUrlDetected = html.includes(collectUrl) || /\/api\/collect/.test(html);

      if (result.apiKeyDetected) {
        result.scriptDetected = "yes";
        result.hint = "✓ 사이트 HTML에서 이 소스의 API 키를 찾았어요. 다음으로 실제 폼을 제출해 데이터 흐름을 확인하세요.";
      } else if (result.collectUrlDetected) {
        result.scriptDetected = "unknown";
        result.hint = "⚠ collect URL은 있지만 API 키가 다릅니다. 다른 소스의 스크립트가 설치돼있을 수 있어요. 스크립트를 다시 복사해 설치해주세요.";
      } else {
        result.scriptDetected = "no";
        result.hint = "✗ 사이트 HTML에서 우리 스크립트를 찾지 못했어요. 아임웹 관리자 → 사이트 설정 → 사용자 정의 코드 에 스크립트가 들어있는지 확인하세요. (외부 .js로 빼셨다면 탐지가 안 될 수 있어요)";
      }
    } else {
      result.hint = `사이트 응답 코드 ${res.status}. 비공개 페이지이거나 임시 오류일 수 있어요. 직접 폼을 제출해 테스트해주세요.`;
    }
  } catch (e) {
    result.hint = "사이트에 접근하지 못했어요. URL이 맞는지, 외부에서 접근 가능한지 확인해주세요. " + (e instanceof Error ? `(${e.message})` : "");
  }

  return NextResponse.json(result);
}

// 폴링용 GET: 지정 시각 이후 새 레코드 카운트 + 가장 최근 1건 반환
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { searchParams } = new URL(request.url);
  const sinceStr = searchParams.get("since");
  const since = sinceStr ? new Date(sinceStr) : new Date(Date.now() - 60_000);
  if (isNaN(since.getTime())) {
    return NextResponse.json({ error: "since 형식이 잘못됐어요" }, { status: 400 });
  }

  const records = await prisma.collectRecord.findMany({
    where: { sourceId: id, createdAt: { gt: since } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json({
    count: records.length,
    latest: records[0] ?? null,
    records,
  });
}
