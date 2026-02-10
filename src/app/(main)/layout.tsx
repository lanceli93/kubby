import { SessionProvider } from "@/providers/session-provider";
import { QueryProvider } from "@/providers/query-provider";
import { AppHeader } from "@/components/layout/app-header";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <QueryProvider>
        <div className="flex h-full flex-col">
          <AppHeader />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </QueryProvider>
    </SessionProvider>
  );
}
