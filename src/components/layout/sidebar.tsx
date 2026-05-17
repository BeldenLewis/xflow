"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Link2, BarChart3, LogOut,
  ChevronDown, Plus, FolderOpen, Check, Loader2, Settings2, Settings,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/contexts/workspace";
import { toast } from "sonner";
import { WorkspaceSettingsModal } from "@/components/workspace/workspace-settings-modal";
import { ProfileSettingsModal } from "@/components/user/profile-settings-modal";
import { NotificationPanel } from "@/components/notifications/notification-panel";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "대시보드" },
  { href: "/utm-builder", icon: Link2, label: "UTM 빌더" },
  { href: "/analytics", icon: BarChart3, label: "마케팅 채널", soon: true },
];

function Dropdown({
  open, onClose, children,
}: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-2xl shadow-lg z-50 overflow-hidden"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const {
    workspace, workspaces, projects, currentProject,
    setCurrentProject, switchWorkspace, refreshProjects, isLoading,
  } = useWorkspace();

  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [wsSettingsOpen, setWsSettingsOpen] = useState(false);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [isCreatingWs, setIsCreatingWs] = useState(false);

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserEmail(user.email ?? "");
    });
    fetch("/api/user/profile").then((r) => r.json()).then((d) => {
      if (d.profile?.name) setUserName(d.profile.name);
    }).catch(() => {});
  }, []);

  const displayName = userName || userEmail;
  const initial = displayName?.[0]?.toUpperCase() ?? "?";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim()) return;
    setIsCreatingWs(true);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWsName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(`생성 실패: ${data.error}`); return; }
      await switchWorkspace(data.workspace);
      setNewWsName(""); setShowNewWs(false); setWsMenuOpen(false);
      toast.success(`'${data.workspace.name}' 워크스페이스가 생성됐어요`);
    } catch (err) {
      toast.error(`워크스페이스 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setIsCreatingWs(false); }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setIsCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      const data = await res.json();
      await refreshProjects();
      setCurrentProject(data.project);
      setNewProjectName(""); setShowNewProject(false); setProjectMenuOpen(false);
      toast.success(`'${data.project.name}' 프로젝트가 생성됐어요`);
    } catch (err) {
      toast.error(`프로젝트를 생성하지 못했어요. ${err instanceof Error ? err.message : "다시 시도해주세요"}`);
    } finally { setIsCreatingProject(false); }
  };

  return (
    <>
    <aside className="flex flex-col w-60 bg-background rounded-2xl shadow-md fixed left-2 top-2 bottom-2 z-30">

      {/* 워크스페이스 switcher */}
      <div className="px-3 pt-4 pb-2">
        <div className="relative">
          <button
            onClick={() => { setWsMenuOpen(!wsMenuOpen); setProjectMenuOpen(false); setProfileOpen(false); }}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {workspace?.name?.[0]?.toUpperCase() ?? "W"}
              </div>
              <div className="min-w-0 text-left">
                <p className="text-sm font-semibold truncate leading-tight">
                  {isLoading ? "로딩 중..." : (workspace?.name ?? "워크스페이스")}
                </p>
                <p className="text-[11px] text-muted-foreground">워크스페이스</p>
              </div>
            </div>
            <motion.div animate={{ rotate: wsMenuOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </motion.div>
          </button>

          <Dropdown open={wsMenuOpen} onClose={() => { setWsMenuOpen(false); setShowNewWs(false); setNewWsName(""); }}>
            <div className="p-1">
              <p className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">워크스페이스</p>
              {workspaces.map((ws) => (
                <button key={ws.id}
                  onClick={() => { switchWorkspace(ws); setWsMenuOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-secondary transition-colors text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {ws.name[0].toUpperCase()}
                    </div>
                    <span className="truncate">{ws.name}</span>
                  </div>
                  {workspace?.id === ws.id && <Check className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                </button>
              ))}
            </div>
            <div className="border-t border-border p-1">
              <button
                onClick={() => { setWsMenuOpen(false); setWsSettingsOpen(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-secondary transition-colors text-sm text-muted-foreground">
                <Settings2 className="w-3.5 h-3.5" />워크스페이스 설정
              </button>
            </div>
            <div className="border-t border-border p-2">
              <AnimatePresence mode="wait">
                {showNewWs ? (
                  <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                    <input autoFocus type="text" placeholder="워크스페이스 이름" value={newWsName}
                      onChange={(e) => setNewWsName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCreateWorkspace(); if (e.key === "Escape") setShowNewWs(false); }}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-violet-400"
                    />
                    <div className="flex gap-1.5">
                      <motion.button whileTap={{ scale: 0.95 }} onClick={handleCreateWorkspace} disabled={!newWsName.trim() || isCreatingWs}
                        className="flex-1 rounded-lg bg-violet-500 py-1.5 text-xs font-medium text-white hover:bg-violet-600 transition-colors disabled:opacity-40">
                        {isCreatingWs ? "생성 중..." : "생성"}
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setShowNewWs(false); setNewWsName(""); }}
                        className="flex-1 rounded-lg border border-border py-1.5 text-xs hover:bg-secondary transition-colors">
                        취소
                      </motion.button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.button key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setShowNewWs(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-secondary transition-colors text-sm text-muted-foreground">
                    <Plus className="w-3.5 h-3.5" />새 워크스페이스 추가
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </Dropdown>
        </div>
      </div>

      {/* 프로젝트 선택기 */}
      <div className="px-3 pb-3">
        <div className="relative">
          <button
            onClick={() => { setProjectMenuOpen(!projectMenuOpen); setWsMenuOpen(false); setProfileOpen(false); }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-secondary transition-colors text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen className="w-4 h-4 text-violet-500 shrink-0" />
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              ) : (
                <span className="font-medium truncate">{currentProject?.name ?? "프로젝트 선택"}</span>
              )}
            </div>
            <motion.div animate={{ rotate: projectMenuOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </motion.div>
          </button>

          <Dropdown open={projectMenuOpen} onClose={() => { setProjectMenuOpen(false); setShowNewProject(false); setNewProjectName(""); }}>
            <div className="p-1">
              <p className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">프로젝트</p>
              {projects.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">프로젝트가 없어요</p>
              ) : (
                projects.map((project) => (
                  <button key={project.id}
                    onClick={() => { setCurrentProject(project); setProjectMenuOpen(false); }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-secondary transition-colors text-sm"
                  >
                    <span className="truncate">{project.name}</span>
                    {currentProject?.id === project.id && <Check className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-border p-2">
              <AnimatePresence mode="wait">
                {showNewProject ? (
                  <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                    <input autoFocus type="text" placeholder="프로젝트 이름" value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCreateProject(); if (e.key === "Escape") setShowNewProject(false); }}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-violet-400"
                    />
                    <div className="flex gap-1.5">
                      <motion.button whileTap={{ scale: 0.95 }} onClick={handleCreateProject} disabled={!newProjectName.trim() || isCreatingProject}
                        className="flex-1 rounded-lg bg-violet-500 py-1.5 text-xs font-medium text-white hover:bg-violet-600 transition-colors disabled:opacity-40">
                        {isCreatingProject ? "생성 중..." : "생성"}
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setShowNewProject(false); setNewProjectName(""); }}
                        className="flex-1 rounded-lg border border-border py-1.5 text-xs hover:bg-secondary transition-colors">
                        취소
                      </motion.button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.button key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setShowNewProject(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-secondary transition-colors text-sm text-muted-foreground">
                    <Plus className="w-3.5 h-3.5" />새 프로젝트
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </Dropdown>
        </div>
      </div>

      {/* 구분선 */}
      <div className="mx-3 h-px bg-border/60 mb-2" />

      {/* 네비게이션 */}

      <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label, soon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={soon ? "#" : href}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                isActive ? "bg-violet-500/10 text-violet-500 font-medium" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              } ${soon ? "cursor-not-allowed opacity-50 pointer-events-none" : ""}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
              {soon && <span className="ml-auto text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">준비중</span>}
            </Link>
          );
        })}
      </nav>

      {/* 알림 */}
      <div className="px-3 pb-2">
        <NotificationPanel />
      </div>

      {/* 하단 프로필 */}
      <div className="px-3 pb-3 pt-2" ref={profileRef}>
        <div className="relative">
          <button
            onClick={() => { setProfileOpen(!profileOpen); setWsMenuOpen(false); setProjectMenuOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-500 text-xs font-bold shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate leading-tight">{userName || "내 계정"}</p>
              <p className="text-[11px] text-muted-foreground truncate">{userEmail}</p>
            </div>
            <motion.div animate={{ rotate: profileOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </motion.div>
          </button>

          {/* 위쪽으로 열리는 드롭다운 */}
          <AnimatePresence>
            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 right-0 mb-1 bg-background border border-border rounded-2xl shadow-lg z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-500 text-sm font-bold shrink-0">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{userName || "이름 없음"}</p>
                        <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={() => { setProfileOpen(false); setProfileSettingsOpen(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-secondary transition-colors text-sm text-muted-foreground hover:text-foreground">
                      <Settings className="w-3.5 h-3.5" />프로필 설정
                    </button>
                  </div>
                  <div className="border-t border-border p-1">
                    <button onClick={handleSignOut}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-red-500/10 hover:text-red-500 text-sm text-muted-foreground transition-colors">
                      <LogOut className="w-3.5 h-3.5" />로그아웃
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </aside>

    <WorkspaceSettingsModal open={wsSettingsOpen} onClose={() => setWsSettingsOpen(false)} />
    <ProfileSettingsModal open={profileSettingsOpen} onClose={() => setProfileSettingsOpen(false)} />
</>
  );
}
