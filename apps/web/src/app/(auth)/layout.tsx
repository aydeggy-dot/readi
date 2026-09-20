import type { ReactNode } from "react";
import { Wordmark } from "@/components/layout/wordmark";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-8 px-5 py-8 sm:py-16">
      <Wordmark href="/" tone="paper" className="self-start" />
      {children}
    </main>
  );
}
