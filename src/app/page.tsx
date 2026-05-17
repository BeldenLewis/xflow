"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SmokeyBackground } from "@/components/ui/login-form";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
  </svg>
);

const testimonials = [
  {
    avatarSrc: "https://randomuser.me/api/portraits/women/57.jpg",
    name: "김지수",
    handle: "@jisu_digital",
    text: "팀 전체가 한 곳에서 UTM을 관리할 수 있어서 업무 효율이 정말 많이 올랐어요.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/64.jpg",
    name: "박민준",
    handle: "@minjun_mkt",
    text: "채널별 데이터를 하나의 대시보드에서 보니까 의사결정이 훨씬 빨라졌습니다.",
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/32.jpg",
    name: "이서연",
    handle: "@seoyeon_ads",
    text: "직관적이고 깔끔한 UI 덕분에 팀원들 모두 적응이 빨랐어요. 강력 추천합니다.",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("이메일 또는 비밀번호를 확인해 주세요.");
      setIsLoading(false);
      return;
    }
    router.push("/dashboard");
  };

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="h-[100dvh] w-[100dvw] flex bg-background text-foreground">
      {/* 왼쪽: 로그인 폼 */}
      <section className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter">환영합니다</h1>
            <p className="mt-2 text-muted-foreground">계정에 로그인하고 팀과 함께 시작하세요</p>
          </div>

          <form className="space-y-4" onSubmit={handleSignIn}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">이메일</label>
              <div className="rounded-2xl border border-border bg-foreground/5 transition-colors focus-within:border-violet-400/70 focus-within:bg-violet-500/10">
                <input name="email" type="email" placeholder="이메일을 입력하세요" required
                  className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">비밀번호</label>
              <div className="rounded-2xl border border-border bg-foreground/5 transition-colors focus-within:border-violet-400/70 focus-within:bg-violet-500/10">
                <div className="relative">
                  <input name="password" type={showPassword ? "text" : "password"} placeholder="비밀번호를 입력하세요" required
                    className="w-full bg-transparent text-sm p-4 pr-12 rounded-2xl focus:outline-none" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-3 flex items-center">
                    {showPassword
                      ? <EyeOff className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
                      : <Eye className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="rememberMe" className="rounded" />
                <span className="text-foreground/90">로그인 상태 유지</span>
              </label>
              <button type="button" onClick={() => router.push("/reset-password")}
                className="text-violet-400 hover:underline transition-colors">
                비밀번호 재설정
              </button>
            </div>

            <button type="submit" disabled={isLoading}
              className="w-full rounded-2xl bg-primary py-4 font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
              {isLoading ? "로그인 중..." : "로그인"}
            </button>
          </form>

          <div className="relative flex items-center justify-center">
            <span className="w-full border-t border-border" />
            <span className="px-4 text-sm text-muted-foreground bg-background absolute">또는</span>
          </div>

          <button onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 border border-border rounded-2xl py-4 hover:bg-secondary transition-colors">
            <GoogleIcon />Google로 계속하기
          </button>

          <p className="text-center text-sm text-muted-foreground">
            계정이 없으신가요?{" "}
            <button onClick={() => router.push("/signup")} className="text-violet-400 hover:underline transition-colors">
              회원가입
            </button>
          </p>
        </div>
      </section>

      {/* 오른쪽: SmokeyBackground + 후기 */}
      <section className="hidden md:flex flex-1 relative p-4">
        <div className="relative w-full h-full rounded-3xl overflow-hidden bg-gray-900">
          <SmokeyBackground color="#0F2044" backdropBlurAmount="none" className="rounded-3xl" />

          {/* 후기 카드 */}
          <div className="absolute bottom-8 left-6 right-6 grid grid-cols-3 gap-3">
            {testimonials.map((t) => (
              <div key={t.handle}
                className="flex flex-col gap-3 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-4">
                <div className="flex items-center gap-2">
                  <img src={t.avatarSrc} className="h-8 w-8 rounded-xl object-cover shrink-0" alt={t.name} />
                  <div>
                    <p className="font-medium text-white text-xs leading-tight">{t.name}</p>
                    <p className="text-white/50 text-[11px]">{t.handle}</p>
                  </div>
                </div>
                <p className="text-white/80 text-xs leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
