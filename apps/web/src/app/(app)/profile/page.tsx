import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeading } from "@/components/layout/page-heading";
import { TextLink } from "@/components/ui/text-link";
import { VerifyEmailBanner } from "@/components/auth/verify-email-banner";
import { Button } from "@/components/ui/button";
import { formatDate, t } from "@/i18n";
import { consentCopy } from "@/lib/consent-copy";
import { getCareerRoles, getConsents, getCv, getProfile } from "@/lib/profile-data";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: t("profile.title") };

export default async function ProfilePage() {
  const me = await requireOnboarded();
  const [profile, consents, cv, careerRoles] = await Promise.all([
    getProfile(),
    getConsents(),
    getCv(),
    getCareerRoles(),
  ]);
  const notSet = t("common.notSet");
  /*
   * Roles and levels are content now (ADR-0015), so their names come from the catalogue rather than
   * from a message key. A role or level that has since been retired is no longer in it: the slug
   * the profile stored is then shown as it is, which is truer than showing nothing.
   */
  const role = careerRoles.find((candidate) => candidate.slug === profile?.target_role);
  const level = role?.level_options.find((option) => option.slug === profile?.level);
  const stack = role?.stacks.find((option) => option.slug === profile?.target_stack);

  return (
    <>
      <PageHeading title={t("profile.title")} />
      {me.email && !me.email_verified && <VerifyEmailBanner email={me.email} />}

      <Section title={t("profile.goals")} action={<EditLink href="/profile/edit" />}>
        {profile && (
          <>
            <Row label={t("profile.fields.name")} value={profile.name} />
            <Row label={t("profile.fields.targetRole")} value={role?.name ?? profile.target_role} />
            <Row label={t("profile.fields.level")} value={level?.name ?? profile.level} />
            <Row
              label={t("profile.fields.yearsExperience")}
              value={String(profile.years_experience)}
            />
            <Row
              label={t("profile.fields.targetStack")}
              // A retired variant keeps its place on the profile that chose it, named by its slug
              // when the catalogue no longer carries it — the same rule as the role and the level.
              value={stack?.name ?? profile.target_stack ?? notSet}
            />
            <Row
              label={t("profile.fields.technologies")}
              value={
                <ul className="flex flex-wrap gap-2">
                  {profile.technologies.map((item) => (
                    <li
                      key={item}
                      className="rounded-md bg-secondary px-3 py-1 text-base font-bold text-secondary-foreground"
                    >
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

      <Section
        title={t("profile.cv")}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/profile/cv">{t("profile.manage")}</Link>
          </Button>
        }
      >
        <Row label={t("cv.title")} value={t(`cv.status.${cv.status}`)} />
        {cv.parsed && cv.parsed.skills.length > 0 && (
          <Row label={t("cv.fields.skills")} value={cv.parsed.skills.join(", ")} />
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

      <Section
        title={t("profile.account")}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/profile/account">{t("profile.manage")}</Link>
          </Button>
        }
      >
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
        <Row
          label={t("profile.dataAndAccount")}
          value={<TextLink href="/profile/account">{t("account.subtitle")}</TextLink>}
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
    // A ruled section rather than a box: the page reads as one sheet with rules on it (ADR-0013).
    <section className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-frame pb-2">
        <h2 className="text-xl leading-tight">{title}</h2>
        {action}
      </div>
      <dl className="divide-y divide-border">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="text-base text-muted-foreground">{label}</dt>
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
