"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface Project {
  id: string;
  name: string;
  description: string | null;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

interface WorkspaceContextType {
  workspace: Workspace | null;
  workspaces: Workspace[];
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (project: Project) => void;
  switchWorkspace: (workspace: Workspace) => Promise<void>;
  refreshProjects: () => Promise<void>;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setCurrentProject = (project: Project) => {
    setCurrentProjectState(project);
    localStorage.setItem("currentProjectId", project.id);
  };

  const applyProjects = (newProjects: Project[]) => {
    setProjects(newProjects);
    const savedId = localStorage.getItem("currentProjectId");
    const saved = newProjects.find((p) => p.id === savedId);
    setCurrentProjectState(saved ?? newProjects[0] ?? null);
  };

  const refreshProjects = useCallback(async () => {
    const currentWsId = localStorage.getItem("currentWorkspaceId");
    const url = currentWsId ? `/api/workspace/${currentWsId}` : "/api/workspace";
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (data.workspace) setWorkspace(data.workspace);
    if (data.workspaces) setWorkspaces(data.workspaces);
    applyProjects(data.projects ?? []);
  }, []);

  const switchWorkspace = useCallback(async (ws: Workspace) => {
    localStorage.setItem("currentWorkspaceId", ws.id);
    localStorage.removeItem("currentProjectId");
    setWorkspace(ws);
    const res = await fetch(`/api/workspace/${ws.id}`);
    if (!res.ok) return;
    const data = await res.json();
    applyProjects(data.projects ?? []);
  }, []);

  useEffect(() => {
    const init = async () => {
      const res = await fetch("/api/workspace");
      if (!res.ok) return;
      const data = await res.json();
      setWorkspaces(data.workspaces ?? []);

      const savedWsId = localStorage.getItem("currentWorkspaceId");
      const savedWs = (data.workspaces ?? []).find((w: Workspace) => w.id === savedWsId);
      const activeWs = savedWs ?? data.workspace;

      if (activeWs) {
        setWorkspace(activeWs);
        if (activeWs.id !== data.workspace?.id) {
          const wsRes = await fetch(`/api/workspace/${activeWs.id}`);
          const wsData = await wsRes.json();
          applyProjects(wsData.projects ?? []);
        } else {
          applyProjects(data.projects ?? []);
        }
      }
    };
    init().finally(() => setIsLoading(false));
  }, []);

  return (
    <WorkspaceContext.Provider value={{
      workspace, workspaces, projects, currentProject,
      setCurrentProject, switchWorkspace, refreshProjects, isLoading,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
