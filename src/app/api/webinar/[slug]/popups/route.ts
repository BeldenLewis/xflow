import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const popups = await prisma.webinarPopup.findMany({
    where: { webinarId: webinar.id, isActive: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, type: true, title: true, message: true,
      buttonLabel: true, buttonUrl: true,
      secondaryLabel: true, secondaryUrl: true,
      integrationType: true, embedCode: true,
      tallyFormId: true, tallyEmojiText: true, tallyEmojiAnimation: true, tallyLayout: true,
      tallyWidth: true, tallyAutoClose: true, dismissible: true,
    },
  });

  return NextResponse.json({ popups }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  });
}
