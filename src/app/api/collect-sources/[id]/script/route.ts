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

  var UTM_KEY = "xflow_utm";

  function saveUTMIfPresent() {
    var params = new URLSearchParams(window.location.search);
    var source = params.get("utm_source");
    if (!source) return;
    try {
      sessionStorage.setItem(UTM_KEY, JSON.stringify({
        utmSource:   source,
        utmMedium:   params.get("utm_medium")   || "",
        utmCampaign: params.get("utm_campaign") || "",
        utmTerm:     params.get("utm_term")     || "",
        utmContent:  params.get("utm_content")  || "",
      }));
    } catch(e) {}
  }

  function getUTMParams() {
    var params = new URLSearchParams(window.location.search);
    if (params.get("utm_source")) {
      return {
        utmSource:   params.get("utm_source")   || "",
        utmMedium:   params.get("utm_medium")   || "",
        utmCampaign: params.get("utm_campaign") || "",
        utmTerm:     params.get("utm_term")     || "",
        utmContent:  params.get("utm_content")  || "",
      };
    }
    try {
      var stored = sessionStorage.getItem(UTM_KEY);
      if (stored) return JSON.parse(stored);
    } catch(e) {}
    return { utmSource: "", utmMedium: "", utmCampaign: "", utmTerm: "", utmContent: "" };
  }

  saveUTMIfPresent();

  function getFieldMeta() {
    var groups = document.querySelectorAll(".form-group");
    return Array.from(groups).map(function(group, i) {
      var labelEl = group.querySelector("label");
      var input = group.querySelector("input, select, textarea");
      var labelText = (labelEl ? labelEl.textContent.trim() : "") ||
        (input ? (input.placeholder || input.getAttribute("name") || "") : "");
      var type = "text";
      if (input) {
        if (input.tagName === "SELECT") type = "select";
        else if (input.type === "checkbox") type = "checkbox";
        else if (input.type === "radio") type = "radio";
      }
      return { index: i, label: labelText, type: type };
    });
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
      keepalive: true,
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        data: formData,
        _fieldMeta: getFieldMeta(),
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

  var triggered = false;
  var pendingData = null;

  // 제출/확인 버튼 클릭 시점에 미리 데이터 스냅샷 (폼 초기화 전)
  document.addEventListener("click", function(e) {
    if (triggered) return;
    var target = e.target;
    var btn = target.closest
      ? target.closest("button, input[type='submit'], a")
      : null;
    if (!btn) return;
    var text = (btn.innerText || btn.value || "").trim();
    var isSubmit = btn.type === "submit" || text === "확인" || text === "OK"
      || text === "접수" || text === "제출" || text === "신청";
    if (isSubmit) {
      pendingData = collectData();
    }
  }, true);

  function fire() {
    if (triggered) return;
    triggered = true;
    sendData(pendingData || collectData());
    if (REDIRECT_URL) {
      setTimeout(function() { window.location.href = REDIRECT_URL; }, 1000);
    }
  }

  var observer = new MutationObserver(function() {
    if (triggered) return;
    var bodyText = document.body.innerText || document.body.textContent || "";
    if (bodyText.indexOf(SUCCESS_TRIGGER) !== -1) {
      fire();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
})();`;

  return NextResponse.json({ script });
}
