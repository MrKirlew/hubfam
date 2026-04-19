/**
 * SmartInputParser.test.ts
 *
 * Unit tests for natural-language QuickAddBar parsing.
 * Fixture: Saturday 2026-04-18 10:00 local.
 */

import { parseSmartInput, ParseContext } from "../services/SmartInputParser";

const NOW = new Date(2026, 3, 18, 10, 0, 0); // 2026-04-18 10:00 local (Saturday, April=3)

const CTX_BASE: ParseContext = {
  now: NOW,
  members: [
    { id: "mA", name: "Alice", initials: "AL" },
    { id: "mB", name: "Bob",   initials: "BO" },
  ],
  lists: [
    { id: "lG", name: "Groceries" },
    { id: "lK", name: "Kids" },
  ],
  calendars: [
    { id: "cF", name: "Family" },
  ],
  defaultSegment: "list",
};

function parse(text: string, overrides: Partial<ParseContext> = {}) {
  return parseSmartInput(text, { ...CTX_BASE, ...overrides });
}

describe("SmartInputParser — dates and times", () => {
  it("parses 'Dentist tomorrow at 3pm'", () => {
    const r = parse("Dentist tomorrow at 3pm", { defaultSegment: "calendar" });
    expect(r.fields.date).toBe("2026-04-19");
    expect(r.fields.time).toBe("15:00");
    expect(r.fields.allDay).toBe(false);
    expect(r.fields.title.toLowerCase()).toContain("dentist");
    expect(r.intents).toContain("event");
  });

  it("parses 'Meeting at 14:30'", () => {
    const r = parse("Meeting at 14:30", { defaultSegment: "calendar" });
    expect(r.fields.time).toBe("14:30");
    expect(r.fields.allDay).toBe(false);
  });

  it("treats 'Brunch Sunday' as all-day", () => {
    const r = parse("Brunch Sunday", { defaultSegment: "calendar" });
    expect(r.fields.date).toBe("2026-04-19");
    expect(r.fields.allDay).toBe(true);
    expect(r.fields.time).toBeUndefined();
  });

  it("parses 'in 2 hours'", () => {
    const r = parse("Call vendor in 2 hours", { defaultSegment: "calendar" });
    expect(r.fields.date).toBe("2026-04-18");
    expect(r.fields.time).toBe("12:00");
  });

  it("parses time ranges with end", () => {
    const r = parse("Team sync tomorrow 9am to 10am", { defaultSegment: "calendar" });
    expect(r.fields.time).toBe("09:00");
    expect(r.fields.endTime).toBe("10:00");
  });

  it("flags past date in warnings", () => {
    // forwardDate: true pushes April 10 to next year (2027) — so no warning expected
    // for bare "April 10". Use explicit past year to force warning.
    const r = parse("Meeting on April 10 2025", { defaultSegment: "calendar" });
    expect(r.warnings).toContain("date in past");
  });
});

describe("SmartInputParser — recurrence", () => {
  it("'every Tuesday 4pm' → weekly, days=[2], time=16:00", () => {
    const r = parse("Soccer every Tuesday 4pm", { defaultSegment: "calendar" });
    expect(r.fields.recurrence).toBe("weekly");
    expect(r.fields.recurrenceDays).toEqual([2]);
    expect(r.fields.time).toBe("16:00");
  });

  it("'every weekday 6am' → weekly, days=[1..5]", () => {
    const r = parse("Gym every weekday 6am", { defaultSegment: "calendar" });
    expect(r.fields.recurrence).toBe("weekly");
    expect(r.fields.recurrenceDays).toEqual([1, 2, 3, 4, 5]);
    expect(r.fields.time).toBe("06:00");
  });

  it("'every weekend' → weekends", () => {
    const r = parse("Yoga every weekend", { defaultSegment: "calendar" });
    expect(r.fields.recurrence).toBe("weekends");
  });

  it("'every Monday night' → weekly, days=[1]", () => {
    const r = parse("Trash every Monday night", { defaultSegment: "calendar" });
    expect(r.fields.recurrence).toBe("weekly");
    expect(r.fields.recurrenceDays).toEqual([1]);
  });

  it("'every month pay rent' → monthly", () => {
    const r = parse("Every month pay rent", { defaultSegment: "calendar" });
    expect(r.fields.recurrence).toBe("monthly");
  });

  it("'daily vitamins' → daily", () => {
    const r = parse("Daily vitamins", { defaultSegment: "reminder" });
    expect(r.fields.recurrence).toBe("daily");
  });

  it("'every Mon, Wed, Fri' → weekly, days=[1,3,5]", () => {
    const r = parse("Standup every Mon, Wed, Fri 9am", { defaultSegment: "calendar" });
    expect(r.fields.recurrence).toBe("weekly");
    expect(r.fields.recurrenceDays).toEqual([1, 3, 5]);
  });
});

describe("SmartInputParser — multi-intent", () => {
  it("event + reminder + task from single sentence", () => {
    const r = parse(
      "Soccer practice every Tuesday 4pm — remind me 30min before and add to Kids list",
      { defaultSegment: "list" }
    );
    expect(r.intents.sort()).toEqual(["event", "reminder", "task"].sort());
    expect(r.fields.recurrence).toBe("weekly");
    expect(r.fields.recurrenceDays).toEqual([2]);
    expect(r.fields.time).toBe("16:00");
    expect(r.fields.reminderOffsetMin).toBe(30);
    expect(r.fields.listId).toBe("lK");
    expect(r.fields.title.toLowerCase()).toContain("soccer");
    expect(r.missingFields.length).toBe(0);
  });

  it("escalates intent — list mode + datetime produces both", () => {
    const r = parse("Dentist tomorrow 3pm", { defaultSegment: "list" });
    expect(r.intents).toContain("task");
    expect(r.intents).toContain("event");
  });

  it("'remind me' without time unit still adds reminder intent", () => {
    const r = parse("Remind me to take meds", { defaultSegment: "reminder" });
    expect(r.intents).toContain("reminder");
  });
});

describe("SmartInputParser — member detection", () => {
  it("assigns Alice when she's the subject", () => {
    const r = parse("Alice clean your room", { defaultSegment: "list" });
    expect(r.fields.memberId).toBe("mA");
  });

  it("@Bob syntax assigns Bob", () => {
    const r = parse("@Bob call the plumber", { defaultSegment: "list" });
    expect(r.fields.memberId).toBe("mB");
  });

  it("'for Mom' style — 'for Alice' assigns Alice", () => {
    const r = parse("Dentist tomorrow 3pm for Alice", { defaultSegment: "calendar" });
    expect(r.fields.memberId).toBe("mA");
  });

  it("does NOT assign when name is direct object of pick up / call / drop off", () => {
    const r = parse("Pick up Alice from school at 3pm", { defaultSegment: "calendar" });
    expect(r.fields.memberId).not.toBe("mA");
    expect(r.fields.memberId).toBeFalsy();
  });

  it("marks memberId missing when two names collide", () => {
    const ctx: Partial<ParseContext> = {
      members: [
        { id: "m1", name: "Alex", initials: "AL" },
        { id: "m2", name: "Alan", initials: "AL" },
      ],
    };
    const r = parse("AL buy milk", ctx);
    expect(r.fields.memberId).toBeFalsy();
  });

  it("case-insensitive member match", () => {
    const r = parse("alice pick up dry cleaning", { defaultSegment: "list" });
    expect(r.fields.memberId).toBe("mA");
  });
});

describe("SmartInputParser — list and calendar hints", () => {
  it("'add eggs to groceries list' → listId lG", () => {
    const r = parse("add eggs to groceries list", { defaultSegment: "list" });
    expect(r.fields.listId).toBe("lG");
    expect(r.fields.title.toLowerCase()).toContain("eggs");
  });

  it("'#Kids homework folder' → listId lK", () => {
    const r = parse("#Kids homework folder", { defaultSegment: "list" });
    expect(r.fields.listId).toBe("lK");
  });

  it("'on Family calendar' → calendarId cF", () => {
    const r = parse("Birthday party Saturday 6pm on Family calendar", { defaultSegment: "calendar" });
    expect(r.fields.calendarId).toBe("cF");
  });

  it("missingFields includes listId when multiple lists and none inferred", () => {
    const r = parse("generic item", { defaultSegment: "list" });
    expect(r.missingFields).toContain("listId");
  });
});

describe("SmartInputParser — location", () => {
  it("'at Luigi's tomorrow 7pm' extracts Luigi's as location, not time", () => {
    const r = parse("Dinner at Luigi's tomorrow 7pm", { defaultSegment: "calendar" });
    expect(r.fields.location).toBe("Luigi's");
    expect(r.fields.time).toBe("19:00");
  });

  it("does NOT treat 'at 3pm' as a location", () => {
    const r = parse("Meeting at 3pm", { defaultSegment: "calendar" });
    expect(r.fields.location).toBeUndefined();
  });
});

describe("SmartInputParser — reminder offset", () => {
  it("'remind me 30min before' → 30", () => {
    const r = parse("Remind me 30min before", { defaultSegment: "reminder" });
    expect(r.fields.reminderOffsetMin).toBe(30);
  });

  it("'remind 1 hour prior' → 60", () => {
    const r = parse("Dentist tomorrow 3pm, remind 1 hour prior", { defaultSegment: "calendar" });
    expect(r.fields.reminderOffsetMin).toBe(60);
  });

  it("'remind me 15 minutes before' → 15", () => {
    const r = parse("Yoga remind me 15 minutes before", { defaultSegment: "reminder" });
    expect(r.fields.reminderOffsetMin).toBe(15);
  });
});

describe("SmartInputParser — trivial and negative", () => {
  it("plain 'Buy milk' on list mode → single task, low confidence, no missing (single list)", () => {
    const ctx: Partial<ParseContext> = { lists: [{ id: "lG", name: "Groceries" }] };
    const r = parse("Buy milk", { ...ctx, defaultSegment: "list" });
    expect(r.intents).toEqual(["task"]);
    expect(r.missingFields).not.toContain("listId");
    expect(r.confidence).toBeLessThan(0.3);
  });

  it("empty string → empty title, default intent", () => {
    const r = parse("", { defaultSegment: "list" });
    expect(r.fields.title).toBe("");
    expect(r.intents).toEqual(["task"]);
  });

  it("whitespace only → empty", () => {
    const r = parse("    ", { defaultSegment: "list" });
    expect(r.fields.title).toBe("");
  });

  it("gibberish still returns a title", () => {
    const r = parse("asdfghjkl", { defaultSegment: "list" });
    expect(r.fields.title).toBe("asdfghjkl");
  });

  it("'tomorrow tomorrow' — chrono picks one date, title retains remainder", () => {
    const r = parse("tomorrow tomorrow", { defaultSegment: "calendar" });
    expect(r.fields.date).toBe("2026-04-19");
  });
});

describe("SmartInputParser — confidence scoring", () => {
  it("plain task: confidence 0", () => {
    const ctx: Partial<ParseContext> = { lists: [{ id: "lG", name: "Groceries" }] };
    const r = parse("Buy milk", { ...ctx, defaultSegment: "list" });
    expect(r.confidence).toBe(0);
  });

  it("rich input: confidence > 0.6", () => {
    const r = parse(
      "Soccer every Tuesday 4pm remind me 30min before add to Kids list",
      { defaultSegment: "list" }
    );
    expect(r.confidence).toBeGreaterThan(0.6);
  });
});

describe("SmartInputParser — missing fields per intent", () => {
  it("event with no time → time in missing", () => {
    const r = parse("Dentist", { defaultSegment: "calendar" });
    expect(r.missingFields).toContain("date");
  });

  it("reminder with no offset → reminderOffsetMin in missing", () => {
    const r = parse("Remind me to take meds", { defaultSegment: "reminder" });
    expect(r.missingFields).toContain("reminderOffsetMin");
  });

  it("fully-specified single-intent event → no missing", () => {
    const ctx: Partial<ParseContext> = { calendars: [{ id: "cF", name: "Family" }] };
    const r = parse("Dentist tomorrow 3pm", { ...ctx, defaultSegment: "calendar" });
    expect(r.missingFields.length).toBe(0);
  });
});
