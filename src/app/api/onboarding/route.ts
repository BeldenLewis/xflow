import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function POST(request: Request) {
  try {
    // 서버 측에서 인증 확인 — 클라이언트가 보낸 userId는 신뢰하지 않음.
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!authUser.email) {
      return NextResponse.json({ error: "이메일 정보를 확인할 수 없습니다." }, { status: 400 });
    }

    const body = await request.json();
    const workspaceName = typeof body.workspaceName === "string" ? body.workspaceName.trim() : "";
    if (!workspaceName) {
      return NextResponse.json({ error: "워크스페이스 이름을 입력해주세요." }, { status: 400 });
    }

    const slugBase = workspaceName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "ws";
    const email = authUser.email.toLowerCase();
    const displayName = (authUser.user_metadata?.name as string | undefined) ?? authUser.email;

    // 같은 이메일이 다른 id로 이미 등록된 경우 (이전 계정 잔여 등) 명확한 에러 반환.
    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    if (existingByEmail && existingByEmail.id !== authUser.id) {
      return NextResponse.json({
        error: "이 이메일로 이미 등록된 계정이 있습니다. 다른 이메일로 시도하거나 관리자에게 문의해주세요.",
      }, { status: 409 });
    }

    // User + Workspace + Member + 기본 Project 트랜잭션 (원자성 보장).
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { id: authUser.id },
        update: { email },
        create: { id: authUser.id, email, name: displayName },
      });

      const workspace = await tx.workspace.create({
        data: { name: workspaceName, slug: `${slugBase}-${Date.now()}` },
      });

      await tx.workspaceMember.create({
        data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" },
      });

      // 기본 프로젝트 자동 생성 — 초대받은 사용자도 바로 활용 가능하도록.
      const project = await tx.project.create({
        data: { workspaceId: workspace.id, name: "기본 프로젝트" },
      });

      return { workspace, project };
    });

    await logActivity({
      workspaceId: result.workspace.id,
      userId: authUser.id,
      action: "workspace.created",
      meta: { name: result.workspace.name, slug: result.workspace.slug, source: "onboarding" },
    });

    return NextResponse.json({ ok: true, workspace: result.workspace, project: result.project });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[onboarding] failed:", message, err);
    return NextResponse.json({
      error: "워크스페이스 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
      ...(process.env.NODE_ENV === "development" ? { detail: message } : {}),
    }, { status: 500 });
  }
}
