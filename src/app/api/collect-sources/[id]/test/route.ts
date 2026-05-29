import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// 사이트 URL 을 fetch 해서 스크립트가 설치돼있는지 점검.
// 점검 항목:
//  - 사이트 응답 도달 가능 여부
//  - HTML 에 1줄 loader (/s/{id}) 가 포함 여부 (권장 방식)
//  - HTML 에 우리 collect URL / API 키 포함 여부 (인라인 fallback)
//  - 등록된 페이지 패턴(formPagePatterns) 과 siteUrl 매칭 여부
//
// 주의: 아임웹은 사용자 정의 코드를 페이지에 직접 인라인하므로 보통 HTML 에 나타남.
//      외부 .js 파일로 빼서 src 로 로드한 경우엔 인라인 탐지 불가 → '판단 불가' 응답.
//      1줄 loader 는 src 로 들어가므로 HTML 안에 URL 그대로 노출됨.

// glob 매칭(서버측 미러). collect-script.ts 의 pathMatchesPattern 과 동일 로직.
// 대소문자 무시 + 끝 슬래시 관용.
function normPath(p: string): string {
  let s = (p || "/").toLowerCase();
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
function pathMatchesPattern(pathname: string, pattern: string): boolean {
  const pat = normPath(pattern);
  const path = normPath(pathname);
  const escaped = pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  try {
    return new RegExp("^" + escaped + "$").test(path);
  } catch {
    return false;
  }
}

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
    loaderDetected: boolean;
    apiKeyDetected: boolean;
    collectUrlDetected: boolean;
    formPagePatterns: string[];
    patternsConfigured: boolean;
    siteUrlMatchesPattern: boolean | null;
    hint: string;
  } = {
    siteUrl: source.siteUrl,
    siteReachable: false,
    statusCode: null,
    scriptDetected: "unknown",
    loaderDetected: false,
    apiKeyDetected: false,
    collectUrlDetected: false,
    formPagePatterns: source.formPagePatterns ?? [],
    patternsConfigured: (source.formPagePatterns ?? []).length > 0,
    siteUrlMatchesPattern: null,
    hint: "",
  };

  // 페이지 패턴 검증: siteUrl 이 등록된 패턴 중 하나에 매칭되는지.
  // 패턴이 없으면 null (= 모든 페이지에서 동작).
  if (result.patternsConfigured && source.siteUrl) {
    try {
      const sitePath = new URL(source.siteUrl).pathname || "/";
      result.siteUrlMatchesPattern = result.formPagePatterns.some((p) => pathMatchesPattern(sitePath, p));
    } catch {
      result.siteUrlMatchesPattern = false;
    }
  }

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
      const loaderUrl = `${baseUrl.replace(/\/+$/, "")}/s/${id}`;

      result.loaderDetected = html.includes(loaderUrl) || html.includes(`/s/${id}`);
      result.apiKeyDetected = html.includes(source.apiKey);
      result.collectUrlDetected = html.includes(collectUrl) || /\/api\/collect/.test(html);

      if (result.loaderDetected) {
        result.scriptDetected = "yes";
        result.hint = "✓ 1줄 loader가 사이트 HTML에 설치되어 있어요. 다음으로 실제 폼을 제출해 데이터 흐름을 확인하세요.";
      } else if (result.apiKeyDetected) {
        result.scriptDetected = "yes";
        result.hint = "✓ 인라인 스크립트가 설치되어 있어요. (1줄 loader 사용을 권장합니다)";
      } else if (result.collectUrlDetected) {
        result.scriptDetected = "unknown";
        result.hint = "⚠ collect URL은 있지만 이 소스의 식별자(loader/API 키)는 찾지 못했어요. 다른 소스의 스크립트가 설치돼있을 수 있어요. 스크립트를 다시 복사해 설치해주세요.";
      } else {
        result.scriptDetected = "no";
        result.hint = "✗ 사이트 HTML에서 스크립트를 찾지 못했어요. 1줄 loader 또는 인라인 스크립트가 공통 헤더에 있는지 확인하세요.";
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
