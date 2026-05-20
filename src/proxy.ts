import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // OAuth 콜백은 세션 교환 전이므로 미들웨어 통과
  if (request.nextUrl.pathname.startsWith("/auth/callback")) {
    return NextResponse.next();
  }

  // /api/collect는 API key 인증을 사용하므로 미들웨어 통과
  if (request.nextUrl.pathname.startsWith("/api/collect")) {
    return NextResponse.next();
  }

  // /api/webinar/[slug]/* 는 공개 웨비나 API (인증 불필요)
  if (request.nextUrl.pathname.startsWith("/api/webinar/")) {
    return NextResponse.next();
  }

  // /webinar/[slug]/live 는 공개 라이브 페이지
  if (request.nextUrl.pathname.match(/^\/webinar\/[^/]+\/live/)) {
    return NextResponse.next();
  }

  // /api/public 과 /share 는 토큰 기반 공개 — 미들웨어 통과
  if (
    request.nextUrl.pathname.startsWith("/api/public") ||
    request.nextUrl.pathname.startsWith("/api/shorten-url") ||
    request.nextUrl.pathname.startsWith("/share") ||
    request.nextUrl.pathname.startsWith("/r/")
  ) {
    return NextResponse.next();
  }

  // 크론 워커 (인증된 호출 — secret 헤더로 보호되어야 함)
  if (request.nextUrl.pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  const publicPages = ["/", "/signup", "/reset-password"];
  const isPublicPage = publicPages.includes(request.nextUrl.pathname);

  // 비로그인 상태에서 보호된 페이지 접근 → 로그인으로
  if (!user && !isPublicPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 로그인 상태에서 로그인/회원가입 페이지 접근 → 대시보드로
  if (user && (request.nextUrl.pathname === "/" || request.nextUrl.pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
