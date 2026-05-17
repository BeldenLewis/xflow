import { WorkspaceProvider } from "@/contexts/workspace";
import { Sidebar } from "@/components/layout/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <div className="flex h-screen bg-muted">
        <Sidebar />
        <main className="flex-1 ml-64 my-2 mr-2 overflow-y-auto bg-background rounded-2xl shadow-sm">
          {children}
        </main>
      </div>
    </WorkspaceProvider>
  );
}
