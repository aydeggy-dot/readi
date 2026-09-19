import type { ReactNode } from "react";
import { QueryProvider } from "@/components/query-provider";
import { AppHeader } from "@/components/layout/app-header";
import { requireUser } from "@/lib/session";

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-6 sm:px-8 sm:py-10">
        <QueryProvider>{children}</QueryProvider>
      </main>
    </>
  );
}
