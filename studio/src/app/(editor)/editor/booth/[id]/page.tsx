import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EditorClient } from "./EditorClient";

export default async function BoothDesignPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();

  const booth = await prisma.boothConfig.findUnique({
    where: { id: params.id, operatorId: session.user.id },
    select: {
      id:                 true,
      boothName:          true,
      slug:               true,
      pricePerSession:    true,
      primaryColor:       true,
      accentColor:        true,
      logoUrl:            true,
      welcomeScreenPrefs: true,
    },
  });

  if (!booth) notFound();

  return (
    <EditorClient
      boothId={booth.id}
      boothName={booth.boothName}
      slug={booth.slug}
      pricePerSession={booth.pricePerSession}
      primaryColor={booth.primaryColor}
      accentColor={booth.accentColor}
      logoUrl={booth.logoUrl ?? null}
      savedPrefs={(booth.welcomeScreenPrefs as Record<string, unknown>) ?? null}
    />
  );
}
