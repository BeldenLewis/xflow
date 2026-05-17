import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({
    where: { id },
    include: { fieldMappings: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://xflow-app.vercel.app";
  const collectUrl = `${baseUrl}/api/collect`;

  const fieldMap = source.fieldMappings
    .map((f) => `    { index: ${f.index}, key: ${JSON.stringify(f.key)}, label: ${JSON.stringify(f.label)} }`)
    .join(",\n");

  const script = `(function() {
  var COLLECT_URL = ${JSON.stringify(collectUrl)};
  var API_KEY = ${JSON.stringify(source.apiKey)};
  var SUCCESS_TRIGGER = ${JSON.stringify(source.successTrigger)};
  var REDIRECT_URL = ${JSON.stringify(source.redirectUrl ?? "")};

  var FIELD_MAP = [
${fieldMap}
  ];

  function getUTMParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get("utm_source") || "",
      utmMedium: params.get("utm_medium") || "",
      utmCampaign: params.get("utm_campaign") || "",
      utmTerm: params.get("utm_term") || "",
      utmContent: params.get("utm_content") || "",
    };
  }

  function collectData() {
    var groups = document.querySelectorAll(".form-group");
    var data = {};
    FIELD_MAP.forEach(function(field) {
      var group = groups[field.index];
      if (!group) return;
      var input = group.querySelector("input, select, textarea");
      if (input) data[field.key] = input.value || "";
    });
    return data;
  }

  function sendData(formData) {
    var utm = getUTMParams();
    fetch(COLLECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        data: formData,
        utmSource: utm.utmSource,
        utmMedium: utm.utmMedium,
        utmCampaign: utm.utmCampaign,
        utmTerm: utm.utmTerm,
        utmContent: utm.utmContent,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
      }),
    }).catch(function() {});
  }

  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) {
          var text = node.textContent || "";
          if (text.indexOf(SUCCESS_TRIGGER) !== -1) {
            sendData(collectData());
            if (REDIRECT_URL) {
              setTimeout(function() { window.location.href = REDIRECT_URL; }, 1000);
            }
          }
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();`;

  return NextResponse.json({ script });
}
