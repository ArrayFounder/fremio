import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
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
      <DashboardShell
        businessName={user.businessName ?? user.name ?? "Operator"}
        email={user.email ?? ""}
        tier={user.subscriptionTier ?? "STARTER"}
      >
        {children}
      </DashboardShell>
    </SWRProvider>
  );
}
