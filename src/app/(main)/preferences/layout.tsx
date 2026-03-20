import { PreferencesSidebar } from "@/components/layout/preferences-sidebar";

export default function PreferencesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col md:flex-row">
      <PreferencesSidebar />
      <div className="flex-1 overflow-y-scroll">{children}</div>
    </div>
  );
}
