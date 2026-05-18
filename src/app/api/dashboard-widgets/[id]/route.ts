import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function authorize(widgetId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const widget = await prisma.dashboardWidget.findUnique({ where: { id: widgetId } });
  if (!widget) return { error: NextResponse.json({ error: "위젯을 찾을 수 없어요" }, { status: 404 }) };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: widget.workspaceId } },
  });
  if (!membership) return { error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) };

  return { widget, userId: user.id };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { title, config, width, position } = body;

  const updated = await prisma.dashboardWidget.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(config !== undefined && { config }),
      ...(width !== undefined && { width }),
      ...(position !== undefined && { position }),
    },
  });

  return NextResponse.json({ widget: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  await prisma.dashboardWidget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
