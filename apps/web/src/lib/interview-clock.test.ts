import { describe, expect, it } from "vitest";
import { elapsedMinutes, elapsedPercent, minutesLeft, timeLabel } from "./interview-clock";

const START = Date.parse("2026-09-25T10:00:00.000Z");
const ENDS_AT = "2026-09-25T10:30:00.000Z";
const minutes = (count: number) => START + count * 60_000;

describe("minutesLeft", () => {
  it("floors, so nobody is told they have a minute they do not have", () => {
    expect(minutesLeft(ENDS_AT, minutes(0))).toBe(30);
    // 90 seconds left is one minute, not two.
    expect(minutesLeft(ENDS_AT, START + 28.5 * 60_000)).toBe(1);
  });

  it("never goes negative", () => {
    expect(minutesLeft(ENDS_AT, minutes(45))).toBe(0);
  });
});

describe("timeLabel", () => {
  it("counts down in minutes", () => {
    expect(timeLabel(ENDS_AT, minutes(19))).toBe("11 min left");
  });

  it("says so under a minute, rather than showing a zero", () => {
    expect(timeLabel(ENDS_AT, START + 29.5 * 60_000)).toBe("Under a minute left");
  });

  it("says the time is up once the deadline has passed", () => {
    expect(timeLabel(ENDS_AT, minutes(30))).toBe("Time is up");
    expect(timeLabel(ENDS_AT, minutes(31))).toBe("Time is up");
  });
});

describe("elapsedPercent", () => {
  it("measures time gone, not questions answered", () => {
    expect(elapsedPercent(ENDS_AT, 30, minutes(0))).toBe(0);
    expect(elapsedPercent(ENDS_AT, 30, minutes(15))).toBe(50);
    expect(elapsedPercent(ENDS_AT, 30, minutes(30))).toBe(100);
  });

  it("stays inside the bar when the clock is past the deadline or ahead of the start", () => {
    expect(elapsedPercent(ENDS_AT, 30, minutes(90))).toBe(100);
    expect(elapsedPercent(ENDS_AT, 30, minutes(-10))).toBe(0);
  });

  /*
   * A resumed session gets a fresh `ends_at` from the state frame but keeps `planned_minutes`, so
   * the two can disagree; the meter must still be a meter.
   */
  it("clamps when the deadline is further away than the session is long", () => {
    expect(elapsedPercent("2026-09-25T11:00:00.000Z", 15, minutes(0))).toBe(0);
  });
});

describe("elapsedMinutes", () => {
  it("reports what the session took, not what was on offer", () => {
    expect(elapsedMinutes(ENDS_AT_START, "2026-09-25T10:06:00.000Z", minutes(20))).toBe(6);
  });

  it("rounds a session still running against the clock", () => {
    expect(elapsedMinutes(ENDS_AT_START, null, minutes(12))).toBe(12);
  });

  it("never says zero minutes", () => {
    expect(elapsedMinutes(ENDS_AT_START, "2026-09-25T10:00:10.000Z", minutes(1))).toBe(1);
  });
});

const ENDS_AT_START = "2026-09-25T10:00:00.000Z";
