import { AdminSidebar } from "@/components/layout/admin-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col md:flex-row">
      <AdminSidebar />
      <div className="flex-1 overflow-y-scroll">{children}</div>
    </div>
  );
}
