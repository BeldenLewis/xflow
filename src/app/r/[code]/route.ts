import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const shortLink = await prisma.shortLink.findUnique({
    where: { code },
    select: { longUrl: true },
  });

  if (!shortLink) {
    return new NextResponse("Short link not found", { status: 404 });
  }

  return NextResponse.redirect(shortLink.longUrl, 302);
}
