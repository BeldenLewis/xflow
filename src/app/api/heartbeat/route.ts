import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// 로그인 사용자의 마지막 활동 시각 갱신. 클라이언트가 하루 1회 호출 (throttle).
// last_sign_in_at(명시적 로그인만 갱신)으로는 세션 유지 사용자의 실제 접속을 못 잡으므로
// 자체 lastActiveAt 컬럼으로 정확한 "마지막 접속"을 추적한다.
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });
    // User row가 아직 없을 수도 있으니 updateMany (없으면 0건 — 에러 안 남).
    await prisma.user.updateMany({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
