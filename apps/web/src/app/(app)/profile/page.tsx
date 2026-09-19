import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { VerifyEmailBanner } from "@/components/auth/verify-email-banner";
import { Button } from "@/components/ui/button";
import { formatDate, t } from "@/i18n";
import { consentCopy } from "@/lib/consent-copy";
import { getConsents, getProfile } from "@/lib/profile-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("profile.title") };

export default async function ProfilePage() {
  const me = await requireOnboarded();
  const [profile, consents] = await Promise.all([getProfile(), getConsents()]);
  const notSet = t("common.notSet");

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{t("profile.title")}</h1>
      {me.email && !me.email_verified && <VerifyEmailBanner email={me.email} />}

      <Section title={t("profile.goals")} action={<EditLink href="/profile/edit" />}>
        {profile && (
          <>
            <Row label={t("profile.fields.name")} value={profile.name} />
            <Row
              label={t("profile.fields.targetRole")}
              value={t(`targetRoles.${profile.target_role}`)}
            />
            <Row label={t("profile.fields.level")} value={t(`levels.${profile.level}`)} />
            <Row
              label={t("profile.fields.yearsExperience")}
              value={String(profile.years_experience)}
            />
            <Row
              label={t("profile.fields.stack")}
              value={
                <ul className="flex flex-wrap gap-2">
                  {profile.stack.map((item) => (
                    <li key={item} className="rounded-full border px-3 py-0.5 text-sm">
                      {item}
                    </li>
                  ))}
                </ul>
              }
            />
            <Row
              label={t("profile.fields.targetCompanyType")}
              value={t(`companyTypes.${profile.target_company_type}`)}
            />
            <Row
              label={t("profile.fields.targetDate")}
              value={profile.target_date ? formatDate(profile.target_date) : notSet}
            />
          </>
        )}
      </Section>

      <Section title={t("profile.privacy")} action={<EditLink href="/profile/consent" />}>
        {consents.map((consent) => (
          <Row
            key={consent.type}
            label={consentCopy(consent.type).title}
            value={consent.granted ? t("profile.on") : t("profile.off")}
          />
        ))}
      </Section>

      <Section title={t("profile.account")}>
        <Row
          label={t("auth.email")}
          value={
            me.email
              ? `${me.email} · ${me.email_verified ? t("profile.verified") : t("profile.notVerified")}`
              : notSet
          }
        />
        <Row label={t("profile.phone")} value={me.phone_number ?? notSet} />
        <Row
          label={t("profile.signupMethod")}
          value={t(`profile.signupMethods.${me.signup_method}`)}
        />
      </Section>
    </>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <dl className="divide-y">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words sm:text-right">{value}</dd>
    </div>
  );
}

function EditLink({ href }: { href: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href}>{t("common.edit")}</Link>
    </Button>
  );
}
