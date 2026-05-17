import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  return NextResponse.json({ profile });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { name } = await request.json();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name: name?.trim() || null },
  });
  return NextResponse.json({ profile: updated });
}
