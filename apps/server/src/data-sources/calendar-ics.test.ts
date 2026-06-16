import { describe, expect, it } from "vitest";
import { CalendarIcsSource } from "./calendar-ics.js";

describe("CalendarIcsSource", () => {
  const source = new CalendarIcsSource();

  it("parses VEVENT blocks with UTC, all-day, and folded lines", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:evt-1@test",
      "SUMMARY:晨会 站会",
      "DTSTART:20260615T010000Z",
      "DTEND:20260615T013000Z",
      "LOCATION:会议室 A",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:evt-2@test",
      "SUMMARY:全天:项目截止日",
      "DTSTART;VALUE=DATE:20260616",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:evt-3@test",
      "SUMMARY:被折叠的很长的标",
      " 题continued",
      "DTSTART:20260617T140000",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const events = source.parse(ics);
    expect(events).toHaveLength(3);

    expect(events[0]).toMatchObject({ uid: "evt-1@test", title: "晨会 站会", allDay: false, location: "会议室 A" });
    expect(events[0]?.start).toBe("2026-06-15T01:00:00.000Z");

    expect(events[1]?.allDay).toBe(true);
    expect(events[1]?.title).toContain("项目截止日");

    // 行折叠：续行拼接
    expect(events[2]?.title).toBe("被折叠的很长的标题continued");
  });

  it("returns empty for non-calendar input", () => {
    expect(source.parse("not an ics")).toHaveLength(0);
    expect(source.parse("")).toHaveLength(0);
  });
});
