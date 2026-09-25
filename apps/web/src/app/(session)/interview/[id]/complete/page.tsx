import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompletionPanel } from "@/components/interview/completion-panel";
import { t } from "@/i18n";
import { getInterview, serverNow } from "@/lib/interview-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("interview.complete.title") };

export default async function InterviewCompletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOnboarded();
  const { id } = await params;
  const session = await getInterview(id);
  if (!session) notFound();
  return <CompletionPanel session={session} now={serverNow()} />;
}
