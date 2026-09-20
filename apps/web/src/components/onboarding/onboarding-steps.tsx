import { t } from "@/i18n";
import { cn } from "@/lib/utils";

// The CV step is optional (skippable), but always shown so the order is predictable.
const STEPS = ["profile", "cv", "consent"] as const;

/**
 * Where you are in onboarding, set like the contents line of a marked-up page: the step you are on
 * is underlined in the mentor's pen and carries `aria-current="step"` (ADR-0013). The names are
 * listed rather than drawn as bars, so the whole path is readable at 360px.
 */
export function OnboardingSteps({ current }: { current: (typeof STEPS)[number] }) {
  const index = STEPS.indexOf(current);
  return (
    <nav aria-label={t("onboarding.stepsLabel")} className="flex flex-col gap-2">
      <p className="text-base text-muted-foreground">
        {t("onboarding.stepOf", { current: index + 1, total: STEPS.length })}
      </p>
      <ol className="flex flex-wrap gap-x-5 gap-y-1 font-bold">
        {STEPS.map((step, i) => (
          <li
            key={step}
            aria-current={i === index ? "step" : undefined}
            className={cn(
              i === index
                ? "text-heading underline decoration-pen decoration-2 underline-offset-[6px]"
                : "text-muted-foreground",
            )}
          >
            {t(`onboarding.steps.${step}`)}
          </li>
        ))}
      </ol>
    </nav>
  );
}
