import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { DISPLAY_KEY, parseDisplay, serializeDisplay } from "@/lib/display";
import { NIGHT_END, NIGHT_START, THEME_COLORS, THEME_HELP, THEME_MODES, isNight, msToNextBoundary, resolveTheme, type ThemeMode } from "@/lib/theme";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";

const at = (hour: number, minute = 0) => new Date(2026, 10, 18, hour, minute, 0, 0); // device-local

describe("the night hours", () => {
  it("are 19:00 and 07:00, in one place", () => {
    expect(NIGHT_START).toBe(19);
    expect(NIGHT_END).toBe(7);
    expect(THEME_HELP).toBe("Automatic switches to dark from 19:00 to 07:00 by your device's clock, or whenever your device is set to dark.");
  });
});

describe("resolveTheme at the boundaries (Automatic, light device)", () => {
  const cases: Array<[string, Date, "light" | "dark"]> = [
    ["midnight", at(0, 0), "dark"],
    ["06:59", at(6, 59), "dark"],
    ["07:00", at(7, 0), "light"],
    ["noon", at(12, 0), "light"],
    ["18:59", at(18, 59), "light"],
    ["19:00", at(19, 0), "dark"],
    ["23:59", at(23, 59), "dark"],
  ];
  for (const [name, when, expected] of cases) {
    it(`${name} is ${expected}`, () => expect(resolveTheme("auto", when, false)).toBe(expected));
  }
  it("is dark on a dark device at any hour", () => {
    for (let h = 0; h < 24; h++) expect(resolveTheme("auto", at(h), true)).toBe("dark");
  });
  it("Light and Dark ignore both the clock and the device", () => {
    for (let h = 0; h < 24; h++)
      for (const dark of [false, true]) {
        expect(resolveTheme("light", at(h), dark)).toBe("light");
        expect(resolveTheme("dark", at(h), dark)).toBe("dark");
      }
  });
  it("isNight matches", () => {
    expect(isNight(at(6, 59))).toBe(true);
    expect(isNight(at(7, 0))).toBe(false);
    expect(isNight(at(18, 59))).toBe(false);
    expect(isNight(at(19, 0))).toBe(true);
  });
});

describe("msToNextBoundary", () => {
  it("counts to 19:00 from midday and to 07:00 from the evening", () => {
    expect(msToNextBoundary(at(12, 0))).toBe(7 * 3_600_000);
    expect(msToNextBoundary(at(19, 0))).toBe(12 * 3_600_000);
    expect(msToNextBoundary(at(23, 30))).toBe(7.5 * 3_600_000);
    expect(msToNextBoundary(at(6, 59))).toBe(60_000);
    expect(msToNextBoundary(at(18, 59))).toBe(60_000);
  });
  it("is always positive", () => {
    for (let h = 0; h < 24; h++) expect(msToNextBoundary(at(h, 0))).toBeGreaterThan(0);
  });
});

describe("stored theme in tgs-display", () => {
  it("a value with no theme field is valid: font and size survive, theme is Automatic", () => {
    expect(parseDisplay('{"v":2,"font":"lora","size":"large"}')).toEqual({ font: "lora", size: "large", theme: "auto" });
  });
  it("keeps a valid theme and falls back to Automatic for anything else", () => {
    expect(parseDisplay('{"v":2,"font":"lora","size":"large","theme":"dark"}').theme).toBe("dark");
    for (const bad of ['"theme":"purple"', '"theme":3', '"theme":null', '"theme":{}']) {
      expect(parseDisplay(`{"v":2,"font":"lora","size":"large",${bad}}`)).toEqual({ font: "lora", size: "large", theme: "auto" });
    }
  });
  it("corrupt or missing storage is Automatic with the default font and size", () => {
    for (const raw of [null, "", "not json", "null", "[]", "42"]) {
      expect(parseDisplay(raw)).toEqual({ font: "atkinson", size: "default", theme: "auto" });
    }
  });
  it("saves Automatic as the absence of a theme, so a font-and-size choice is stored exactly as before", () => {
    expect(serializeDisplay({ font: "inter", size: "default", theme: "auto" })).toBe('{"v":2,"font":"inter","size":"default"}');
    expect(serializeDisplay({ font: "inter", size: "default", theme: "dark" })).toBe('{"v":2,"font":"inter","size":"default","theme":"dark"}');
  });
  it("round-trips, and the version stays 2", () => {
    const value = { font: "inter", size: "small", theme: "light" } as const;
    expect(JSON.parse(serializeDisplay(value)).v).toBe(2);
    expect(parseDisplay(serializeDisplay(value))).toEqual(value);
  });
  it("a legacy (unversioned) value still migrates its sizes and gets Automatic", () => {
    expect(parseDisplay('{"font":"lexend","size":"larger"}')).toEqual({ font: "lexend", size: "large", theme: "auto" });
  });
});

/** Runs the real inline <head> script in a sandbox that has just enough of a browser, and returns what it set. */
function runInitScript(opts: { now: Date; prefersDark: boolean; stored: string | null | "throws" }) {
  const attrs: Record<string, string> = {};
  const metas: Array<{ name: string; content: string }> = [];
  const RealDate = Date;
  const sandbox = {
    Date: class extends RealDate {
      constructor(...args: unknown[]) {
        // @ts-expect-error spread into the Date constructor
        if (args.length) super(...args);
        else super(opts.now.getTime());
      }
    },
    JSON,
    localStorage: {
      getItem: (key: string) => {
        if (opts.stored === "throws") throw new Error("blocked");
        return key === DISPLAY_KEY ? opts.stored : null;
      },
    },
    window: { matchMedia: (q: string) => ({ matches: q === "(prefers-color-scheme: dark)" && opts.prefersDark }) },
    document: {
      documentElement: { setAttribute: (k: string, v: string) => void (attrs[k] = v) },
      createElement: () => ({}) as { name: string; content: string },
      head: { appendChild: (m: { name: string; content: string }) => void metas.push(m) },
    },
  };
  vm.runInNewContext(THEME_INIT_SCRIPT, sandbox);
  return { theme: attrs["data-theme"], mode: attrs["data-theme-mode"], meta: metas.map((m) => m.content) };
}

describe("the inline head script and resolveTheme agree", () => {
  const times: Array<[number, number]> = [[0, 0], [6, 59], [7, 0], [12, 0], [18, 59], [19, 0], [23, 59]];
  for (const mode of THEME_MODES) {
    it(`mode ${mode}: every boundary time, light and dark device`, () => {
      for (const [h, m] of times)
        for (const prefersDark of [false, true]) {
          const now = at(h, m);
          const stored = mode === "auto" ? '{"v":2,"font":"atkinson","size":"default"}' : JSON.stringify({ v: 2, theme: mode as ThemeMode });
          const got = runInitScript({ now, prefersDark, stored });
          const want = resolveTheme(mode, now, prefersDark);
          expect({ at: `${h}:${m}`, prefersDark, theme: got.theme }).toEqual({ at: `${h}:${m}`, prefersDark, theme: want });
          expect(got.mode).toBe(mode);
          expect(got.meta).toEqual([THEME_COLORS[want]]);
        }
    });
  }
  it("missing, corrupt, invalid or blocked storage is Automatic", () => {
    for (const stored of [null, "", "not json", '{"theme":"purple"}', '{"theme":5}', "throws" as const]) {
      const got = runInitScript({ now: at(20), prefersDark: false, stored });
      expect(got.mode).toBe("auto");
      expect(got.theme).toBe("dark");
      const day = runInitScript({ now: at(12), prefersDark: false, stored });
      expect(day.theme).toBe("light");
    }
  });
});
