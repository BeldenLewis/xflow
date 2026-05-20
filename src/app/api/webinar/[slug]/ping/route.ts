import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const webinar = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const body = await request.json().catch(async () => {
    const text = await request.text().catch(() => "");
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  });
  const { registrationId, event } = body;

  if (!registrationId) return NextResponse.json({ ok: true });

  const registration = await prisma.webinarRegistration.findFirst({
    where: { id: registrationId, webinarId: webinar.id },
    select: { id: true, enteredAt: true },
  });
  if (!registration) return NextResponse.json({ ok: true });

  const now = new Date();

  if (event === "enter") {
    await prisma.webinarRegistration.update({
      where: { id: registration.id },
      data: { enteredAt: now, isActive: true, lastPingAt: now, presencePingAt: now },
    });
  } else if (event === "leave") {
    if (registration.enteredAt) {
      const minutes = Math.floor((now.getTime() - new Date(registration.enteredAt).getTime()) / 60000);
      await prisma.webinarRegistration.update({
        where: { id: registration.id },
        data: { leftAt: now, isActive: false, stayMinutes: minutes, lastPingAt: now, presencePingAt: now },
      });
    }
  } else {
    // heartbeat
    await prisma.webinarRegistration.update({
      where: { id: registration.id },
      data: { lastPingAt: now, presencePingAt: now, isActive: true },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
