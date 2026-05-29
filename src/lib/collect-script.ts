/**
 * Collect 스크립트 생성 로직.
 * 두 가지 형태를 만든다:
 *  - utmScript: 사이트 공통 헤더/푸터용 UTM 보존 라이브러리 (form 페이지가 아닌 곳에도 설치).
 *  - script:   form 페이지에 설치되는 실제 수집 스크립트. (utm 보존 로직 + form 수집 + 전송)
 *
 * GTM 스타일 short loader (`/s/{id}`)와 inline copy 양쪽에서 동일한 본문을 사용한다.
 */
export type CollectFieldMapping = {
  index: number;
  key: string;
  label: string;
};

export type CollectScriptSource = {
  id: string;
  apiKey: string;
  successTrigger: string;
  redirectUrl: string | null;
  // 폼 감지가 활성화되는 페이지 경로 패턴 (glob, `*`는 어떤 문자열에도 매칭).
  // 빈 배열이면 모든 페이지에서 활성화 (기존 동작 유지).
  formPagePatterns?: string[];
};

export type BuildCollectScriptsInput = {
  source: CollectScriptSource;
  fieldMappings: CollectFieldMapping[];
  baseUrl: string;
};

export type BuildCollectScriptsOutput = {
  script: string;
  utmScript: string;
};

export function buildCollectScripts({
  source,
  fieldMappings,
  baseUrl,
}: BuildCollectScriptsInput): BuildCollectScriptsOutput {
  const collectUrl = `${baseUrl}/api/collect`;

  const fieldMap = fieldMappings
    .map(
      (f) =>
        `    { index: ${f.index}, key: ${JSON.stringify(f.key)}, label: ${JSON.stringify(f.label)} }`,
    )
    .join(",\n");

  // ── 공통 UTM/어트리뷰션 라이브러리 본문 ─────────────────────────
  // utmScript / script 양쪽에 동일하게 주입.
  // iOS Safari ITP: localStorage가 7일 후 만료될 수 있음. 서버측 first-party cookie 도입 시까지 제약.
  const utmCore = `  /* iOS Safari ITP: localStorage가 7일 후 만료될 수 있음. 서버측 first-party cookie 도입 시까지 제약. */
  var UTM_LAST_KEY  = "mach_utm";
  var UTM_FIRST_KEY = "mach_utm_first";
  var SESSION_KEY   = "mach_session";
  var JOURNEY_KEY   = "mach_utm_journey";
  var LEGACY_UTM_LAST_KEY  = "x" + "flow_utm";
  var LEGACY_UTM_FIRST_KEY = "x" + "flow_utm_first";
  var UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000;   // 30분
  var JOURNEY_MAX = 20;
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"];

  // 클릭 ID → source/medium 매핑 (UTM 없을 때 derive)
  var CLICK_ID_MAP = {
    gclid:     { source: "google",      medium: "cpc" },
    fbclid:    { source: "facebook",    medium: "paid_social" },
    msclkid:   { source: "bing",        medium: "cpc" },
    yclid:     { source: "yandex",      medium: "cpc" },
    dclid:     { source: "doubleclick", medium: "display" },
    li_fat_id: { source: "linkedin",    medium: "paid_social" }
  };

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

  function emptyUtm() { return { utmSource:"", utmMedium:"", utmCampaign:"", utmTerm:"", utmContent:"", utmId:"", referrer:"", seenAt:"" }; }

  function isBot() {
    var ua = navigator.userAgent || "";
    return /bot|crawl|spider|slurp|googlebot|bingbot|facebookexternalhit|whatsapp|telegram|twitterbot|linkedinbot/i.test(ua);
  }

  function isKakaoInApp() { return /KAKAOTALK/i.test(navigator.userAgent || ""); }

  function getCookieDomain() {
    var host = location.hostname;
    if (!host || /^[0-9.]+$/.test(host) || host === "localhost") return null;
    var parts = host.split(".");
    if (parts.length < 2) return null;
    if (parts.length >= 3 && (parts[parts.length - 2] === "co" || parts[parts.length - 2] === "ne" || parts[parts.length - 2] === "or")) {
      return "." + parts.slice(-3).join(".");
    }
    return "." + parts.slice(-2).join(".");
  }

  function storageGet(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed._exp && parsed._exp > Date.now()) return parsed.v;
        if (parsed && !parsed._exp) return parsed;
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
        if (c.indexOf(key + "=") === 0) return JSON.parse(decodeURIComponent(c.substring(key.length + 1)));
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
      var cookieStr = key + "=" + encodeURIComponent(JSON.stringify(value)) + ";path=/;max-age=" + maxAge + ";SameSite=Lax";
      var dom = getCookieDomain();
      if (dom) cookieStr += ";domain=" + dom;
      document.cookie = cookieStr;
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

  function param(params, key) {
    return params.get(key) || params.get(key.toUpperCase()) || params.get(key.replace(/_([a-z])/g, function(_, c) { return c.toUpperCase(); })) || "";
  }

  function hasAnyUtm(params) {
    for (var i = 0; i < UTM_KEYS.length; i++) {
      if (param(params, UTM_KEYS[i])) return true;
    }
    return false;
  }

  function findClickId(params) {
    for (var k in CLICK_ID_MAP) {
      var v = params.get(k) || params.get(k.toLowerCase());
      if (v) return { id: v, source: CLICK_ID_MAP[k].source, medium: CLICK_ID_MAP[k].medium, key: k };
    }
    return null;
  }

  // utmSource/utmMedium 은 lowercase+trim, 나머지는 trim 만
  function normalizeUtm(u) {
    var lcTrim = function(s) { return (s || "").toString().trim().toLowerCase(); };
    var tr = function(s) { return (s || "").toString().trim(); };
    return {
      utmSource:   lcTrim(u.utmSource),
      utmMedium:   lcTrim(u.utmMedium),
      utmCampaign: tr(u.utmCampaign),
      utmTerm:     tr(u.utmTerm),
      utmContent:  tr(u.utmContent),
      utmId:       tr(u.utmId),
      referrer:    u.referrer || "",
      seenAt:      u.seenAt || new Date().toISOString()
    };
  }

  function readUrlUtm() {
    var params = new URLSearchParams(window.location.search);
    var hasUtm = hasAnyUtm(params);
    var click = findClickId(params);
    if (!hasUtm && !click) return null;
    var base = {
      utmSource:   param(params, "utm_source"),
      utmMedium:   param(params, "utm_medium"),
      utmCampaign: param(params, "utm_campaign"),
      utmTerm:     param(params, "utm_term"),
      utmContent:  param(params, "utm_content"),
      utmId:       param(params, "utm_id"),
      referrer:    document.referrer || "",
      seenAt:      new Date().toISOString()
    };
    // 클릭 ID 있고 utm_source/medium 비어있으면 derive
    if (click) {
      if (!base.utmSource) base.utmSource = click.source;
      if (!base.utmMedium) base.utmMedium = click.medium;
      if (!base.utmId)     base.utmId    = click.id;
    }
    return normalizeUtm(base);
  }

  function inferFromReferrer() {
    var ref = document.referrer;
    if (!ref) return null;
    try {
      var u = new URL(ref);
      var host = u.hostname.replace(/^www\\./, "").toLowerCase();
      if (u.hostname === location.hostname) return null;
      var matched = null;
      for (var k in REFERRER_MAP) {
        if (host === k || host.endsWith("." + k)) { matched = REFERRER_MAP[k]; break; }
      }
      if (matched) {
        return normalizeUtm({
          utmSource: matched[0], utmMedium: matched[1],
          utmCampaign: "", utmTerm: "", utmContent: "", utmId: "",
          referrer: ref, seenAt: new Date().toISOString()
        });
      }
      return normalizeUtm({
        utmSource: host, utmMedium: "referral",
        utmCampaign: "", utmTerm: "", utmContent: "", utmId: "",
        referrer: ref, seenAt: new Date().toISOString()
      });
    } catch(e) { return null; }
  }

  function inferDirect() {
    return normalizeUtm({
      utmSource: "(direct)", utmMedium: "(none)",
      utmCampaign: "", utmTerm: "", utmContent: "", utmId: "",
      referrer: "", seenAt: new Date().toISOString()
    });
  }

  // 30분 세션 — lastActivity 기준
  function getSession() {
    var s = storageGet(SESSION_KEY);
    if (s && s.lastActivity && (Date.now() - s.lastActivity) < SESSION_TIMEOUT_MS) return s;
    return null;
  }
  function updateSessionActivity() {
    storageSet(SESSION_KEY, { lastActivity: Date.now() }, UTM_TTL_MS);
  }

  function appendToJourney(utm) {
    var journey = storageGet(JOURNEY_KEY) || [];
    if (!Array.isArray(journey)) journey = [];
    var last = journey[journey.length - 1];
    if (last && last.utmSource === utm.utmSource && last.utmMedium === utm.utmMedium && last.utmCampaign === utm.utmCampaign) return;
    journey.push({
      utmSource: utm.utmSource, utmMedium: utm.utmMedium, utmCampaign: utm.utmCampaign,
      utmId: utm.utmId || "", referrer: utm.referrer || "", seenAt: utm.seenAt
    });
    if (journey.length > JOURNEY_MAX) journey = journey.slice(-JOURNEY_MAX);
    storageSet(JOURNEY_KEY, journey, UTM_TTL_MS);
  }

  function captureUtm() {
    if (isBot()) return;

    var urlUtm = readUrlUtm();
    var existingSession = getSession();

    if (urlUtm) {
      // URL에 UTM/clickID 있음 → last 갱신, first 미설정 시 first도 설정, journey 추가
      storageSet(UTM_LAST_KEY, urlUtm, UTM_TTL_MS);
      if (!storageGet(UTM_FIRST_KEY)) storageSet(UTM_FIRST_KEY, urlUtm, UTM_TTL_MS);
      appendToJourney(urlUtm);
      updateSessionActivity();
      return;
    }

    if (existingSession) {
      // 세션 계속 (30분 이내) — last 변경하지 않음, journey 추가하지 않음
      updateSessionActivity();
      return;
    }

    // 새 세션 시작, URL UTM 없음 → referrer / kakao / direct 순서로 추론
    var refUtm = inferFromReferrer();
    if (refUtm) {
      storageSet(UTM_LAST_KEY, refUtm, UTM_TTL_MS);
      if (!storageGet(UTM_FIRST_KEY)) storageSet(UTM_FIRST_KEY, refUtm, UTM_TTL_MS);
      appendToJourney(refUtm);
      updateSessionActivity();
      return;
    }

    if (isKakaoInApp()) {
      var kakaoUtm = normalizeUtm({
        utmSource: "kakao", utmMedium: "messenger",
        utmCampaign: "", utmTerm: "", utmContent: "", utmId: "",
        referrer: "", seenAt: new Date().toISOString()
      });
      storageSet(UTM_LAST_KEY, kakaoUtm, UTM_TTL_MS);
      if (!storageGet(UTM_FIRST_KEY)) storageSet(UTM_FIRST_KEY, kakaoUtm, UTM_TTL_MS);
      appendToJourney(kakaoUtm);
      updateSessionActivity();
      return;
    }

    // 완전 다이렉트 — first 가 아직 없을 때만 (direct) 로 마킹
    if (!storageGet(UTM_FIRST_KEY)) {
      var directUtm = inferDirect();
      storageSet(UTM_LAST_KEY, directUtm, UTM_TTL_MS);
      storageSet(UTM_FIRST_KEY, directUtm, UTM_TTL_MS);
      appendToJourney(directUtm);
    }
    updateSessionActivity();
  }
`;

  const utmScript = `(function() {
${utmCore}
  migrateLegacyUtm();
  captureUtm();

  // 주의: 페이지 내부 링크에 UTM을 자동으로 덧붙이는 동작은 제거했어요.
  // 저장된 UTM은 form submission 시 localStorage에서 읽어 attribution에만 사용.

  window.MachUtm = window.MachUtm || {};
  window.MachUtm.capture = captureUtm;
  window.MachUtm.get = function() {
    return {
      last: storageGet(UTM_LAST_KEY) || emptyUtm(),
      first: storageGet(UTM_FIRST_KEY) || emptyUtm(),
      journey: storageGet(JOURNEY_KEY) || []
    };
  };
})();`;

  const script = `(function() {
  var COLLECT_URL = ${JSON.stringify(collectUrl)};
  var API_KEY = ${JSON.stringify(source.apiKey)};
  var SUCCESS_TRIGGER = ${JSON.stringify(source.successTrigger)};
  var REDIRECT_URL = ${JSON.stringify(source.redirectUrl ?? "")};
  // 폼 감지가 활성화될 페이지 경로 패턴 (glob). 빈 배열 = 모든 페이지.
  var FORM_PAGE_PATTERNS = ${JSON.stringify(source.formPagePatterns ?? [])};

  var FIELD_MAP = [
${fieldMap}
  ];

  // glob 매칭: \`*\` 는 어떤 문자열에도 매칭. 정규식 메타문자는 이스케이프.
  // 대소문자 무시 + 끝 슬래시 관용 (URL 경로는 흔히 대소문자/슬래시가 섞임).
  function normPath(p) {
    p = (p || "/").toLowerCase();
    if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
    return p;
  }
  function pathMatchesPattern(pathname, pattern) {
    var pat = normPath(pattern);
    var path = normPath(pathname);
    var escaped = pat.replace(/[.+?^\${}()|[\\]\\\\]/g, "\\\\$&").replace(/\\*/g, ".*");
    try {
      return new RegExp("^" + escaped + "$").test(path);
    } catch (e) { return false; }
  }

  function isFormPage() {
    // 빈 배열 = 모든 페이지에서 폼 감지 활성화 (기존 동작 유지).
    if (!FORM_PAGE_PATTERNS || FORM_PAGE_PATTERNS.length === 0) return true;
    var path = window.location.pathname || "/";
    for (var i = 0; i < FORM_PAGE_PATTERNS.length; i++) {
      if (pathMatchesPattern(path, FORM_PAGE_PATTERNS[i])) return true;
    }
    return false;
  }

  // ── UTM 어트리뷰션 (first-touch + last-touch + multi-touch journey) ──
${utmCore}

  migrateLegacyUtm();
  captureUtm();

  function getUtmContext() {
    var last = storageGet(UTM_LAST_KEY) || emptyUtm();
    var first = storageGet(UTM_FIRST_KEY) || last;
    if (!last.utmSource && !first.utmSource) {
      var refUtm = inferFromReferrer();
      if (refUtm) { last = refUtm; first = refUtm; }
    }
    var journey = storageGet(JOURNEY_KEY) || [];
    if (!Array.isArray(journey)) journey = [];
    return { last: last, first: first, journey: journey };
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
        var allNumeric = textValues.every(function(v) { return /^\\d+$/.test(v); });
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
        utmId:       last.utmId || "",
        firstUtmSource:   first.utmSource,
        firstUtmMedium:   first.utmMedium,
        firstUtmCampaign: first.utmCampaign,
        firstUtmTerm:     first.utmTerm,
        firstUtmContent:  first.utmContent,
        firstUtmId:       first.utmId || "",
        firstReferrer:    first.referrer || "",
        firstSeenAt:      first.seenAt   || "",
        journey:   ctx.journey,
        referrer:  document.referrer,
        userAgent: navigator.userAgent
      })
    }).catch(function() {});
  }

  // ── 폼 감지 — 패턴에 매칭된 페이지에서만 활성화. UTM 캡처는 위에서 이미 모든 페이지에 대해 실행됨.
  if (isFormPage()) {
    var triggered = false;
    var pendingData = null;
    var pendingAt = 0;
    var sentFingerprints = {};

    // 같은 데이터 중복 전송 방지용 지문 (5초 윈도우)
    function fingerprint(data) {
      try { return JSON.stringify(data); } catch (e) { return String(Date.now()); }
    }

    function capture() {
      var d = collectData();
      // 의미있는 값이 하나라도 있으면 캡처
      var hasValue = false;
      for (var k in d) { if (d[k] && String(d[k]).trim() !== "") { hasValue = true; break; } }
      if (hasValue) {
        pendingData = d;
        pendingAt = Date.now();
      }
      return hasValue;
    }

    function doSend(data, opts) {
      if (!data) return;
      var fp = fingerprint(data);
      var now = Date.now();
      // 5초 내 같은 지문은 중복으로 간주, skip
      if (sentFingerprints[fp] && (now - sentFingerprints[fp]) < 5000) return;
      sentFingerprints[fp] = now;
      sendData(data);
    }

    // 제출 버튼 클릭 → 데이터 캡처
    document.addEventListener("click", function(e) {
      var target = e.target;
      var btn = target.closest
        ? target.closest("button, input[type='submit'], a")
        : null;
      if (!btn) return;
      var text = (btn.innerText || btn.value || "").trim();
      var isSubmit = btn.type === "submit"
        || /확인|접수|제출|신청|등록|보내기|완료|submit|apply|register|send/i.test(text);
      if (isSubmit) capture();
    }, true);

    // native form submit 이벤트 → 데이터 캡처 (버튼 텍스트 매칭 실패 대비)
    document.addEventListener("submit", function() { capture(); }, true);

    // 성공 트리거 텍스트 감지 → 전송 (primary)
    var fire = function() {
      if (triggered) return;
      triggered = true;
      doSend(pendingData || collectData());
      // 재무장 — 같은 페이지에서 추가 제출 가능하도록 3초 후 리셋
      setTimeout(function() { triggered = false; pendingData = null; }, 3000);
      if (REDIRECT_URL) {
        setTimeout(function() { window.location.href = REDIRECT_URL; }, 1000);
      }
    };

    var observer = new MutationObserver(function() {
      if (triggered) return;
      var bodyText = document.body.innerText || document.body.textContent || "";
      if (SUCCESS_TRIGGER && bodyText.indexOf(SUCCESS_TRIGGER) !== -1) {
        fire();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });

    // 페이지 이탈 fallback — 제출 데이터는 캡처됐는데 아직 전송 안 됐고,
    // 캡처된지 60초 이내면 (= 방금 제출하고 thank-you로 넘어가는 중) sendBeacon으로 전송.
    function flushOnLeave() {
      if (!pendingData) return;
      if (Date.now() - pendingAt > 60000) return; // 오래된 캡처는 무시
      var fp = fingerprint(pendingData);
      if (sentFingerprints[fp] && (Date.now() - sentFingerprints[fp]) < 5000) return;
      sentFingerprints[fp] = Date.now();
      try {
        var ctx = getUtmContext();
        var last = ctx.last, first = ctx.first;
        var payload = JSON.stringify({
          data: pendingData,
          _fieldMeta: getFieldMeta(),
          utmSource: last.utmSource, utmMedium: last.utmMedium, utmCampaign: last.utmCampaign,
          utmTerm: last.utmTerm, utmContent: last.utmContent, utmId: last.utmId || "",
          firstUtmSource: first.utmSource, firstUtmMedium: first.utmMedium, firstUtmCampaign: first.utmCampaign,
          firstUtmTerm: first.utmTerm, firstUtmContent: first.utmContent, firstUtmId: first.utmId || "",
          firstReferrer: first.referrer || "", firstSeenAt: first.seenAt || "",
          journey: ctx.journey, referrer: document.referrer, userAgent: navigator.userAgent
        });
        // sendBeacon은 헤더 커스텀 불가 → x-api-key 못 보냄. URL 쿼리로 키 전달.
        var beaconUrl = COLLECT_URL + (COLLECT_URL.indexOf("?") === -1 ? "?" : "&") + "k=" + encodeURIComponent(API_KEY);
        var blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(beaconUrl, blob);
        } else {
          fetch(beaconUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(function(){});
        }
      } catch (e) {}
    }
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "hidden") flushOnLeave();
    }, true);
    window.addEventListener("pagehide", flushOnLeave, true);
  }
})();`;

  return { script, utmScript };
}
