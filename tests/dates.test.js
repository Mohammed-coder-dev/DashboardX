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

describe("one frame for every date shape", () => {
  // JavaScript reads `2024-03-01` as UTC midnight but `03/01/2024`,
  // `Jan 5, 2024` and `2024-03-01 00:30` as midnight *in the machine's zone*.
  // Everything downstream then formats with toISOString(), so east of UTC a
  // US-format date came back as the day before: `03/01/2024` was reported as
  // 2024-02-29 in earliest, latest, every period bucket and every evidence
  // claim quoting them. A spreadsheet date has no timezone - the cell means
  // that calendar day - so all four shapes have to land in one frame.
  //
  // These assertions compare shapes against each other rather than against a
  // literal instant, so they hold in any zone the suite is run in.
  const dayMs = 86_400_000;

  it("reads a slash date as the same day as the ISO form", () => {
    expect(toDate("03/01/2024").getTime()).toBe(toDate("2024-03-01").getTime());
  });

  it("reads a spelled-out date as the same day as the ISO form", () => {
    expect(toDate("Jan 5, 2024").getTime()).toBe(toDate("2024-01-05").getTime());
    expect(toDate("5 Jan 2024").getTime()).toBe(toDate("2024-01-05").getTime());
  });

  it("puts a naive timestamp the stated distance after its own midnight", () => {
    // The spreadsheet parser writes "YYYY-MM-DD HH:MM" for a cell carrying a
    // time, so this is the exact shape that reached here from a workbook.
    expect(toDate("2024-03-01 00:30").getTime() - toDate("2024-03-01").getTime())
      .toBe(30 * 60_000);
    expect(toDate("2024-03-01T18:45").getTime() - toDate("2024-03-01").getTime())
      .toBe((18 * 60 + 45) * 60_000);
  });

  it("keeps consecutive days exactly one day apart", () => {
    expect(toDate("03/02/2024").getTime() - toDate("03/01/2024").getTime()).toBe(dayMs);
  });

  it("reports the calendar day the cell names", () => {
    const slash = profileDates(["03/01/2024", "03/02/2024", "03/03/2024"], 3);
    expect(slash.earliest).toBe("2024-03-01");
    expect(slash.latest).toBe("2024-03-03");
    expect(slash.periods.map((p) => p.period)).toEqual(["2024-03-01", "2024-03-02", "2024-03-03"]);
  });

  it("keeps a timestamped cell on the day it was written", () => {
    const stamped = profileDates(
      ["2024-03-01 00:30", "2024-03-02 00:30", "2024-03-03 23:30"], 3,
    );
    expect(stamped.earliest).toBe("2024-03-01");
    expect(stamped.latest).toBe("2024-03-03");
  });

  it("leaves a value carrying its own zone as the instant it names", () => {
    // Z is not a wall clock waiting to be interpreted; it is an absolute point
    // in time, and re-basing it would move it.
    expect(toDate("2024-03-01T10:30:00Z").toISOString()).toBe("2024-03-01T10:30:00.000Z");
  });

  it("does not remap a two-digit year into the twentieth century", () => {
    // Date.UTC(24, ...) means 1924. Any normalisation that goes through it has
    // to set the year explicitly.
    expect(toDate("0024-01-01").getUTCFullYear()).toBe(24);
  });
});
