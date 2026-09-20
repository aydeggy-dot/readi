import { redirect } from "next/navigation";
import { HOME_PATH, nextOnboardingPath } from "@/lib/navigation";
import { requireUser } from "@/lib/session";

export default async function OnboardingPage() {
  const me = await requireUser();
  redirect(nextOnboardingPath(me.onboarding) ?? HOME_PATH);
}
