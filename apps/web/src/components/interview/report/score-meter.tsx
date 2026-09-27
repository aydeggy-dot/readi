import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * A 0–100 score as a bar (ADR-0013's chart rules, at the smallest size a chart comes in).
 *
 * Three things it will not do. It is **never the only sign of the score**: every caller draws the
 * number beside it, because #F97316 on white is 2.8:1 and a bar on its own is a colour. It has no
 * hover readout to depend on, for the same reason. And it is a `div`, not an SVG or a chart library —
 * the candidate pages have a Slow 4G budget and this is two boxes and a width.
 *
 * `bands` draws the hairlines at 40, 60 and 75, which are the lines ADR-0013 puts on a chart and the
 * lines `scoreBand` cuts at, so the label beside the number and the marks on the bar agree. The topic
 * and question-type rows leave them off: at that size four lines on a 6 px bar is texture, not
 * information.
 */
export function ScoreMeter({
  value,
  bands = false,
  className,
}: {
  value: number;
  bands?: boolean;
  className?: string;
}) {
  const width = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={width}
      aria-valuetext={t("interview.report.meter", { overall: width })}
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-track",
        bands ? "h-2.5" : "h-1.5",
        className,
      )}
    >
      <div className="h-full rounded-full bg-progress" style={{ width: `${width}%` }} />
      {bands &&
        [40, 60, 75].map((band) => (
          // Hairlines over the fill, not under it: the point of a band mark is to say which side of
          // it you landed on, which is only legible where the bar actually changes.
          <span
            key={band}
            aria-hidden
            className="absolute top-0 h-full w-px bg-progress-surface"
            style={{ left: `${band}%` }}
          />
        ))}
    </div>
  );
}
