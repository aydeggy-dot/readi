import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { InterviewScreen } from "@/components/interview/interview-screen";
import { t } from "@/i18n";
import { getInterview, serverNow } from "@/lib/interview-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("interview.screen.title") };

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnboarded();
  const { id } = await params;
  const session = await getInterview(id);
  // Another candidate's session is a 404 too: the API scopes every interview route to its owner.
  if (!session) notFound();
  /*
   * A session that is over has no composer and no clock, so it is a different screen rather than
   * this one with half of it disabled. Rendered on the server, so arriving by an old link or the
   * back button lands in the right place without a flash of the wrong one.
   */
  if (session.status !== "in_progress") redirect(`/interview/${id}/complete`);

  // The server's clock for the first paint of the timer; the browser takes over on mount.
  return <InterviewScreen session={session} now={serverNow()} />;
}
