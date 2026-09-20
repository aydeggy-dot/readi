import type { ReactNode } from "react";
import { PublicHeader } from "@/components/layout/public-header";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl px-5 pt-8 pb-16 sm:px-8 lg:pt-12">{children}</main>
    </>
  );
}
