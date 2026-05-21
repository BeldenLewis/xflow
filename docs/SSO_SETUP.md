# SSO (Google OAuth) 설정 가이드

mach 는 Supabase Auth 를 사용해서 Google OAuth 를 쉽게 추가할 수 있습니다.

## 1. Google Cloud Console 에서 OAuth 클라이언트 생성

1. https://console.cloud.google.com/ 접속
2. **APIs & Services → Credentials** → "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Authorized redirect URIs 에 다음 추가:
   - `https://<your-supabase-project>.supabase.co/auth/v1/callback`
5. 생성된 **Client ID** + **Client Secret** 복사

## 2. Supabase 대시보드에 등록

1. Supabase 대시보드 → **Authentication → Providers → Google**
2. **Enable Google provider** 토글 켜기
3. Client ID / Client Secret 붙여넣기 → Save

## 2-1. Supabase URL Configuration

Supabase 대시보드 → **Authentication → URL Configuration** 에서 아래 값을 확인합니다.

- Site URL: `https://machstudio.vercel.app`
- Redirect URLs:
  - `https://machstudio.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`

도메인을 다시 바꾸면 이 값도 같은 도메인으로 같이 바꿔야 합니다.

## 3. mach 로그인 페이지에 버튼 추가

`src/app/(auth)/page.tsx` (또는 로그인 페이지) 에 추가:

```tsx
import { createClient } from "@/lib/supabase/client";

async function signInWithGoogle() {
  const supabase = createClient();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
}

// 버튼:
<button onClick={signInWithGoogle} className="...">
  Google 로 계속하기
</button>
```

## 4. 콜백 라우트 확인

`src/app/auth/callback/route.ts` 가 이미 존재 — Supabase 가 자동으로 처리.

## 5. 첫 로그인 시 자동 프로비저닝

Supabase Auth 가 새 사용자를 `auth.users` 에 만들고 trigger 로 `public.User` 에도 만들어야 합니다.
init.sql 의 user 자동 생성 trigger 가 이미 있다면 추가 작업 없음.

## 추가: 도메인 제한

특정 회사 도메인만 허용하고 싶다면 Supabase Auth 에서 hook 또는 클라이언트 측 검증으로 처리.
