import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SWRProvider } from "@/components/dashboard/SWRProvider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const user = session.user as any;

  return (
    <SWRProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* Sidebar — sticky kiri (desktop), drawer (mobile) */}
        <Sidebar
          businessName={user.businessName ?? user.name ?? "Operator"}
          email={user.email ?? ""}
          tier={user.subscriptionTier ?? "STARTER"}
        />

        {/* Konten halaman */}
        <main className="flex-1 overflow-y-auto">
          {/* Spacer untuk mobile topbar */}
          <div className="md:hidden h-0" />
          {children}
        </main>
      </div>
    </SWRProvider>
  );
}
