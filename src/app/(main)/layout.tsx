import { SessionProvider } from "@/providers/session-provider";
import { QueryProvider } from "@/providers/query-provider";
import { ScanProvider } from "@/providers/scan-provider";
import { MusicPlayerProvider } from "@/providers/music-player-provider";
import { AppHeader } from "@/components/layout/app-header";
import { GlobalScanBar } from "@/components/layout/global-scan-bar";
import { BottomTabs } from "@/components/layout/bottom-tabs";
import { DomainCookieSync } from "@/components/layout/domain-cookie-sync";
import { NowPlayingBarGate } from "@/components/music/now-playing-bar-gate";
import { NavDrawerProvider, PageShell } from "@/components/layout/nav-drawer";
import { NavSidebar } from "@/components/layout/nav-sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <QueryProvider>
        <ScanProvider>
          {/* Mounted unconditionally so playback (and the persistent <audio>)
              survives route navigation; only the visible bar is gated below. */}
          <MusicPlayerProvider>
            <NavDrawerProvider>
              {/* The drawer opening pushes this shell back into depth; the
                  drawer itself is a sibling so it is never transformed. */}
              <PageShell>
                <DomainCookieSync />
                <AppHeader />
                <main className="flex-1 overflow-hidden pb-14 md:pb-0">{children}</main>
                <GlobalScanBar />
                <NowPlayingBarGate />
                <BottomTabs />
              </PageShell>
              <NavSidebar />
            </NavDrawerProvider>
          </MusicPlayerProvider>
        </ScanProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
