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

  // /api/collect는 API key 인증을 사용하므로 미들웨어 통과
  if (request.nextUrl.pathname.startsWith("/api/collect")) {
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
