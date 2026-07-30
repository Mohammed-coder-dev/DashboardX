import { describe, it, expect } from "vitest";
import { looksLikeDateColumn, profileDates, toDate } from "../src/analytics/dates.js";

describe("toDate", () => {
  it("parses common date shapes", () => {
    expect(toDate("2024-01-31")).toEqual(new Date("2024-01-31"));
    expect(toDate("2024-01-31T10:30:00Z")).toBeInstanceOf(Date);
    expect(toDate("1/31/2024")).toBeInstanceOf(Date);
    expect(toDate("Jan 31, 2024")).toBeInstanceOf(Date);
    expect(toDate("31 Jan 2024")).toBeInstanceOf(Date);
  });

  it("rejects bare numbers so measurements never become timelines", () => {
    expect(toDate(7)).toBeNull();
    expect(toDate(44927)).toBeNull(); // Excel serial — ambiguous, not guessed
    expect(toDate("7")).toBeNull();
  });

  it("rejects missing and non-date values", () => {
    for (const v of [null, undefined, "", "   ", "hello", true]) expect(toDate(v)).toBeNull();
  });

  it("rejects syntactically date-like but impossible dates", () => {
    expect(toDate("2024-99-99")).toBeNull();
  });

  it("passes through valid Date objects and rejects invalid ones", () => {
    const d = new Date("2024-05-05");
    expect(toDate(d)).toBe(d);
    expect(toDate(new Date("nonsense"))).toBeNull();
  });
});

describe("looksLikeDateColumn", () => {
  it("accepts a column that is mostly parseable dates", () => {
    expect(looksLikeDateColumn(["2024-01-01", "2024-01-02", null, "2024-01-03"])).toBe(true);
  });

  it("rejects a text column with an occasional date", () => {
    expect(looksLikeDateColumn(["note", "2024-01-01", "other", "more"])).toBe(false);
  });

  it("rejects an all-missing column", () => {
    expect(looksLikeDateColumn([null, "", undefined])).toBe(false);
  });
});

describe("profileDates", () => {
  it("reports valid, missing and invalid counts with range", () => {
    const values = ["2024-01-01", "2024-01-05", null, "", "not a date", "2024-01-10"];
    const p = profileDates(values, values.length);
    expect(p.validCount).toBe(3);
    expect(p.missing).toBe(2);
    expect(p.invalid).toBe(1);
    expect(p.coverage).toBe(50);
    expect(p.earliest).toBe("2024-01-01");
    expect(p.latest).toBe("2024-01-10");
    expect(p.rangeDays).toBe(9);
  });

  it("returns an inert profile for a column with no dates", () => {
    const p = profileDates([null, "abc"], 2);
    expect(p.validCount).toBe(0);
    expect(p.earliest).toBeNull();
    expect(p.periods).toEqual([]);
  });

  it("buckets by day for short ranges and by month for long ones", () => {
    const days = profileDates(["2024-01-01", "2024-01-02", "2024-01-03"], 3);
    expect(days.granularity).toBe("day");
    const months = Array.from({ length: 12 }, (_, i) =>
      `2024-${String(i + 1).padStart(2, "0")}-15`);
    expect(profileDates(months, 12).granularity).toBe("month");
  });

  it("summarises the chronological trend", () => {
    // Volume grows steadily: 1 event in early months, 4 in late months.
    const values = [];
    for (let m = 1; m <= 9; m++) {
      const count = m <= 3 ? 1 : m <= 6 ? 2 : 4;
      for (let i = 0; i < count; i++) values.push(`2024-0${m}-1${i}`);
    }
    const p = profileDates(values, values.length);
    expect(p.trend).toBe("increasing");
  });

  it("compares the two most recent periods", () => {
    // Spanning five months (> 92 days) so buckets are monthly.
    const values = [
      "2024-02-10", "2024-03-05", "2024-04-12",
      "2024-05-01", "2024-05-02",
      "2024-06-01", "2024-06-02", "2024-06-03",
    ];
    const p = profileDates(values, values.length);
    expect(p.granularity).toBe("month");
    expect(p.periodOverPeriod).toMatchObject({
      current: "2024-06", currentCount: 3, previous: "2024-05", previousCount: 2, delta: 1, changePct: 50,
    });
  });

  it("detects gaps between populated periods", () => {
    const p = profileDates(["2024-01-15", "2024-02-15", "2024-05-15"], 3);
    expect(p.gaps).toContain("2024-03");
    expect(p.gaps).toContain("2024-04");
  });

  it("flags irregular intervals", () => {
    const regular = profileDates(["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"], 4);
    expect(regular.irregularIntervals).toBe(false);
    const irregular = profileDates(["2024-01-01", "2024-01-02", "2024-01-03", "2024-03-20"], 4);
    expect(irregular.irregularIntervals).toBe(true);
  });

  it("is deterministic for identical input", () => {
    const values = ["2024-03-01", "2024-01-01", "2024-02-01"];
    expect(profileDates(values, 3)).toEqual(profileDates(values, 3));
  });
});
