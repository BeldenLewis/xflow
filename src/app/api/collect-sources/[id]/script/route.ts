import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
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

  // ── UTM 어트리뷰션 (first-touch + last-touch, 다중 저장소 폴백, referrer 추론) ──
  var UTM_LAST_KEY  = "mach_utm";        // 최근 유입 (덮어씀)
  var UTM_FIRST_KEY = "mach_utm_first";  // 최초 유입 (한번 설정되면 유지)
  var LEGACY_UTM_LAST_KEY  = "x" + "flow_utm";
  var LEGACY_UTM_FIRST_KEY = "x" + "flow_utm_first";
  var UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

  var REFERRER_MAP = {
    "google.com":      ["google",    "organic"],
    "naver.com":       ["naver",     "organic"],
    "daum.net":        ["daum",      "organic"],
    "bing.com":        ["bing",      "organic"],
    "yahoo.com":       ["yahoo",     "organic"],
    "duckduckgo.com":  ["duckduckgo","organic"],
    "facebook.com":    ["facebook",  "social"],
    "instagram.com":   ["instagram", "social"],
    "twitter.com":     ["twitter",   "social"],
    "x.com":           ["twitter",   "social"],
    "youtube.com":     ["youtube",   "social"],
    "linkedin.com":    ["linkedin",  "social"],
    "kakao.com":       ["kakao",     "social"],
    "tistory.com":     ["tistory",   "referral"],
    "brunch.co.kr":    ["brunch",    "referral"]
  };

  function emptyUtm() { return { utmSource:"", utmMedium:"", utmCampaign:"", utmTerm:"", utmContent:"", referrer:"", seenAt:"" }; }

  function storageGet(key) {
    // localStorage → sessionStorage → cookie 순서로 읽기
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed._exp && parsed._exp > Date.now()) return parsed.v;
        if (parsed && !parsed._exp) return parsed; // legacy
      }
    } catch(e) {}
    try {
      var raw2 = sessionStorage.getItem(key);
      if (raw2) {
        var p2 = JSON.parse(raw2);
        return (p2 && p2.v) ? p2.v : p2;
      }
    } catch(e) {}
    try {
      var cookies = document.cookie ? document.cookie.split(";") : [];
      for (var i = 0; i < cookies.length; i++) {
        var c = cookies[i].replace(/^\\s+/, "");
        if (c.indexOf(key + "=") === 0) {
          return JSON.parse(decodeURIComponent(c.substring(key.length + 1)));
        }
      }
    } catch(e) {}
    return null;
  }

  function storageSet(key, value, ttlMs) {
    var payload = JSON.stringify({ v: value, _exp: Date.now() + ttlMs });
    try { localStorage.setItem(key, payload); } catch(e) {}
    try { sessionStorage.setItem(key, payload); } catch(e) {}
    try {
      var maxAge = Math.floor(ttlMs / 1000);
      document.cookie = key + "=" + encodeURIComponent(JSON.stringify(value)) + ";path=/;max-age=" + maxAge + ";SameSite=Lax";
    } catch(e) {}
  }

  function migrateLegacyUtm() {
    if (!storageGet(UTM_LAST_KEY)) {
      var legacyLast = storageGet(LEGACY_UTM_LAST_KEY);
      if (legacyLast) storageSet(UTM_LAST_KEY, legacyLast, UTM_TTL_MS);
    }
    if (!storageGet(UTM_FIRST_KEY)) {
      var legacyFirst = storageGet(LEGACY_UTM_FIRST_KEY);
      if (legacyFirst) storageSet(UTM_FIRST_KEY, legacyFirst, UTM_TTL_MS);
    }
  }

  function readUrlUtm() {
    var params = new URLSearchParams(window.location.search);
    if (!params.get("utm_source")) return null;
    return {
      utmSource:   params.get("utm_source")   || "",
      utmMedium:   params.get("utm_medium")   || "",
      utmCampaign: params.get("utm_campaign") || "",
      utmTerm:     params.get("utm_term")     || "",
      utmContent:  params.get("utm_content")  || "",
      referrer:    document.referrer || "",
      seenAt:      new Date().toISOString()
    };
  }

  function inferFromReferrer() {
    var ref = document.referrer;
    if (!ref) return null;
    try {
      var u = new URL(ref);
      var host = u.hostname.replace(/^www\\./, "").toLowerCase();
      // 같은 사이트 내부 이동은 외부 유입 아님
      if (u.hostname === location.hostname) return null;
      var matched = null;
      for (var k in REFERRER_MAP) {
        if (host === k || host.endsWith("." + k)) { matched = REFERRER_MAP[k]; break; }
      }
      if (matched) {
        return {
          utmSource: matched[0], utmMedium: matched[1],
          utmCampaign: "", utmTerm: "", utmContent: "",
          referrer: ref, seenAt: new Date().toISOString()
        };
      }
      return {
        utmSource: host, utmMedium: "referral",
        utmCampaign: "", utmTerm: "", utmContent: "",
        referrer: ref, seenAt: new Date().toISOString()
      };
    } catch(e) { return null; }
  }

  // 매 페이지 로드마다 실행 — URL 에 utm 이 있으면 last 갱신 + (없으면) first 설정
  function captureUtm() {
    var urlUtm = readUrlUtm();
    if (urlUtm) {
      storageSet(UTM_LAST_KEY, urlUtm, UTM_TTL_MS);
      if (!storageGet(UTM_FIRST_KEY)) storageSet(UTM_FIRST_KEY, urlUtm, UTM_TTL_MS);
      return;
    }
    // URL 에 utm 없음 — first 가 아예 없으면 referrer 로 추론해서 저장
    if (!storageGet(UTM_FIRST_KEY)) {
      var refUtm = inferFromReferrer();
      if (refUtm) {
        storageSet(UTM_LAST_KEY, refUtm, UTM_TTL_MS);
        storageSet(UTM_FIRST_KEY, refUtm, UTM_TTL_MS);
      }
    }
  }
  migrateLegacyUtm();
  captureUtm();

  function getUtmContext() {
    var last = storageGet(UTM_LAST_KEY) || emptyUtm();
    var first = storageGet(UTM_FIRST_KEY) || last;
    // 둘 다 비어있는데 referrer 라도 있으면 last 로 채움 (이번 페이지 진입 시점)
    if (!last.utmSource && !first.utmSource) {
      var refUtm = inferFromReferrer();
      if (refUtm) { last = refUtm; first = refUtm; }
    }
    return { last: last, first: first };
  }

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
      var els = group.querySelectorAll("input, select, textarea");
      if (!els || els.length === 0) return;

      // 체크박스/라디오: 체크된 항목들의 라벨 텍스트(없으면 value) 콤마로 join
      var checked = [];
      var hasChoice = false;
      var textValues = [];
      Array.prototype.forEach.call(els, function(el) {
        var t = (el.type || "").toLowerCase();
        if (t === "checkbox" || t === "radio") {
          hasChoice = true;
          if (el.checked) {
            var label = el.closest ? el.closest("label") : null;
            var txt = label ? (label.textContent || "").trim() : "";
            checked.push(txt || el.value || "");
          }
        } else {
          var v = (el.value || "").trim();
          if (v) textValues.push(v);
        }
      });

      if (hasChoice) {
        data[field.key] = checked.join(", ");
      } else if (textValues.length === 0) {
        data[field.key] = "";
      } else if (textValues.length === 1) {
        data[field.key] = textValues[0];
      } else {
        // 휴대폰처럼 분할된 input — 모두 숫자면 그대로 이어붙임, 아니면 공백으로 join
        var allNumeric = textValues.every(function(v) { return /^\d+$/.test(v); });
        data[field.key] = textValues.join(allNumeric ? "" : " ");
      }
    });
    return data;
  }

  function sendData(formData) {
    var ctx = getUtmContext();
    var last = ctx.last;
    var first = ctx.first;
    fetch(COLLECT_URL, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        data: formData,
        _fieldMeta: getFieldMeta(),
        utmSource:   last.utmSource,
        utmMedium:   last.utmMedium,
        utmCampaign: last.utmCampaign,
        utmTerm:     last.utmTerm,
        utmContent:  last.utmContent,
        firstUtmSource:   first.utmSource,
        firstUtmMedium:   first.utmMedium,
        firstUtmCampaign: first.utmCampaign,
        firstUtmTerm:     first.utmTerm,
        firstUtmContent:  first.utmContent,
        firstReferrer:    first.referrer || "",
        firstSeenAt:      first.seenAt   || "",
        referrer: document.referrer,
        userAgent: navigator.userAgent
      })
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
