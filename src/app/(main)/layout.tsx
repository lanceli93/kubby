import { SessionProvider } from "@/providers/session-provider";
import { QueryProvider } from "@/providers/query-provider";
import { ScanProvider } from "@/providers/scan-provider";
import { MusicPlayerProvider } from "@/providers/music-player-provider";
import { AppHeader } from "@/components/layout/app-header";
import { GlobalScanBar } from "@/components/layout/global-scan-bar";
import { BottomTabs } from "@/components/layout/bottom-tabs";
import { DomainCookieSync } from "@/components/layout/domain-cookie-sync";
import { NowPlayingBarGate } from "@/components/music/now-playing-bar-gate";

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
            <div className="relative flex h-full flex-col">
              <DomainCookieSync />
              <AppHeader />
              <main className="flex-1 overflow-hidden pb-14 md:pb-0">{children}</main>
              <GlobalScanBar />
              <NowPlayingBarGate />
              <BottomTabs />
            </div>
          </MusicPlayerProvider>
        </ScanProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
