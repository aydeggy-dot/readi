import { t } from "@/i18n";
import { cn } from "@/lib/utils";

// The CV step is optional (skippable), but always shown so the order is predictable.
const STEPS = ["profile", "cv", "consent"] as const;

export function OnboardingSteps({ current }: { current: (typeof STEPS)[number] }) {
  const index = STEPS.indexOf(current);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {t("onboarding.stepOf", { current: index + 1, total: STEPS.length })} ·{" "}
        {t(`onboarding.steps.${current}`)}
      </p>
      <div className="flex gap-1.5" aria-hidden>
        {STEPS.map((step, i) => (
          <span
            key={step}
            className={cn("h-1.5 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-muted")}
          />
        ))}
      </div>
    </div>
  );
}
