import { SessionProvider } from "@/providers/session-provider";
import { QueryProvider } from "@/providers/query-provider";
import { ScanProvider } from "@/providers/scan-provider";
import { AppHeader } from "@/components/layout/app-header";
import { GlobalScanBar } from "@/components/layout/global-scan-bar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <QueryProvider>
        <ScanProvider>
          <div className="relative flex h-full flex-col">
            <AppHeader />
            <main className="flex-1 overflow-hidden">{children}</main>
            <GlobalScanBar />
          </div>
        </ScanProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
