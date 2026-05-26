import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

const MAX_GOOGLE_SHEET_CHARS = 12_000_000;

function buildGoogleSheetCsvUrl(input: string) {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("올바른 Google Sheets URL을 입력해주세요.");
  }

  if (parsed.hostname !== "docs.google.com") {
    throw new Error("docs.google.com Google Sheets URL만 지원합니다.");
  }

  const match = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  const spreadsheetId = match?.[1];
  if (!spreadsheetId) {
    throw new Error("Google Sheets 문서 ID를 찾지 못했어요.");
  }

  const hashGid = parsed.hash.match(/gid=(\d+)/)?.[1];
  const searchGid = parsed.searchParams.get("gid");
  const gid = /^\d+$/.test(searchGid ?? "") ? searchGid : /^\d+$/.test(hashGid ?? "") ? hashGid : "0";

  return {
    fileName: `google-sheets-${spreadsheetId.slice(0, 8)}-gid-${gid}.csv`,
    url: `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv&gid=${gid}`,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    url?: string;
    workspaceId?: string;
    projectId?: string;
  } | null;
  const rawUrl = body?.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Google Sheets URL을 입력해주세요." }, { status: 400 });
  }

  // 워크스페이스 멤버십 확인 — 인증된 사용자가 임의 워크스페이스 컨텍스트로
  // 외부 시트를 요청해서 데이터를 가로채는 시나리오 방어.
  const workspaceId = body?.workspaceId?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "워크스페이스 정보가 필요해요." }, { status: 400 });
  }
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) {
    return NextResponse.json({ error: "워크스페이스 접근 권한이 없어요." }, { status: 403 });
  }
  if (body?.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: { workspaceId: true },
    });
    if (!project || project.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "프로젝트 접근 권한이 없어요." }, { status: 403 });
    }
  }

  try {
    const sheet = buildGoogleSheetCsvUrl(rawUrl);
    const response = await fetch(sheet.url, {
      cache: "no-store",
      headers: {
        Accept: "text/csv,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "시트를 불러오지 못했어요. 공유 권한을 ‘링크가 있는 사용자 보기 가능’으로 설정했는지 확인해주세요." },
        { status: 400 }
      );
    }

    const csv = await response.text();
    const looksLikeHtml = /^\s*<!doctype html/i.test(csv) || /^\s*<html/i.test(csv);
    if (looksLikeHtml) {
      return NextResponse.json(
        { error: "CSV 대신 Google 로그인/권한 페이지가 반환됐어요. 시트 공유 권한을 확인해주세요." },
        { status: 400 }
      );
    }

    if (!csv.trim()) {
      return NextResponse.json({ error: "시트에서 읽을 데이터가 없어요." }, { status: 400 });
    }

    if (csv.length > MAX_GOOGLE_SHEET_CHARS) {
      return NextResponse.json(
        { error: "시트 데이터가 너무 큽니다. 필요한 기간만 필터링한 시트를 연결해주세요." },
        { status: 413 }
      );
    }

    const urlHash = createHash("sha1").update(rawUrl).digest("hex").slice(0, 12);
    await logActivity({
      workspaceId,
      userId: user.id,
      action: "ad.source_synced",
      meta: {
        source: "google_sheet",
        fileName: sheet.fileName,
        urlHash,
        csvBytes: csv.length,
        projectId: body?.projectId ?? null,
      },
    });

    return NextResponse.json({ csv, fileName: sheet.fileName });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Google Sheets를 불러오지 못했어요." },
      { status: 400 }
    );
  }
}
