"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { runAuth } from "@/lib/auth-errors";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await runAuth(() => authClient().signOut());
    router.replace("/");
    router.refresh();
  }

  return (
    <Button type="button" variant="nav" size="sm" disabled={pending} onClick={() => void signOut()}>
      {t("common.logOut")}
    </Button>
  );
}
