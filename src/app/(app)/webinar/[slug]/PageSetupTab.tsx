"use client";

import { type ElementType } from "react";
import { Code2, FileText, ListChecks, Palette, SlidersHorizontal } from "lucide-react";
import SettingsTab from "./SettingsTab";
import RegistrationFormTab from "./RegistrationFormTab";
import SessionsTab from "./SessionsTab";
import ThemeTab from "./ThemeTab";
import EmbedTab from "./EmbedTab";

interface WebinarSession {
  id: string;
  number: number;
  title: string;
  speaker: string | null;
  description: string | null;
  startTime: string;
  endTime: string;
}

interface Webinar {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  liveStartAt: string;
  liveEndAt: string;
  signupDeadline: string;
  theme: Record<string, string>;
  config: Record<string, unknown>;
  sessions: WebinarSession[];
}

type PageSetupSection = "general" | "form" | "sessions" | "theme" | "embed";

const sections: { id: PageSetupSection; label: string; desc: string; icon: ElementType }[] = [
  { id: "general", label: "기본 설정", desc: "일정, 영상, 링크 등 웨비나의 기본 정보를 관리합니다.", icon: SlidersHorizontal },
  { id: "form", label: "등록폼", desc: "사전등록에서 수집할 항목과 동의 문구를 설정합니다.", icon: FileText },
  { id: "sessions", label: "세션", desc: "라이브 페이지에 표시될 아젠다와 시간표를 정리합니다.", icon: ListChecks },
  { id: "theme", label: "테마", desc: "외부 페이지의 색상, 폰트, 화면 톤을 맞춥니다.", icon: Palette },
  { id: "embed", label: "임베드", desc: "배너와 라이브 페이지 코드를 확인하고 실제처럼 미리 봅니다.", icon: Code2 },
];

export default function PageSetupTab({
  webinar,
  onUpdate,
  section,
  onSectionChange,
}: {
  webinar: Webinar;
  onUpdate: () => void;
  section: PageSetupSection;
  onSectionChange: (section: PageSetupSection) => void;
}) {
  const activeMeta = sections.find((item) => item.id === section) ?? sections[0];
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="grid h-full grid-cols-[230px_minmax(0,1fr)] overflow-hidden">
      <aside className="border-r border-border bg-secondary/20 p-5">
        <div className="mb-5">
          <h2 className="text-sm font-semibold">설정</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            외부 페이지와 운영 기본값을 정리합니다.
          </p>
        </div>
        <nav className="space-y-1">
          {sections.map((item) => {
            const Icon = item.icon;
            const active = item.id === section;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSectionChange(item.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-8 py-5">
          <div className="flex items-center gap-2">
            <ActiveIcon className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-semibold">{activeMeta.label}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{activeMeta.desc}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {section === "general" && (
            <div className="h-full overflow-auto">
              <SettingsTab webinar={webinar} onUpdate={onUpdate} />
            </div>
          )}
        {section === "form" && (
          <div className="h-full overflow-auto">
            <RegistrationFormTab webinar={webinar} onUpdate={onUpdate} />
          </div>
        )}
        {section === "sessions" && (
          <div className="h-full overflow-auto">
            <SessionsTab webinarId={webinar.id} sessions={webinar.sessions} onUpdate={onUpdate} />
          </div>
        )}
        {section === "theme" && (
          <div className="h-full overflow-auto">
            <ThemeTab webinar={webinar} onUpdate={onUpdate} />
          </div>
        )}
        {section === "embed" && <EmbedTab webinar={webinar} />}
        </div>
      </div>
    </div>
  );
}
