import { describe, expect, it } from "vitest";
import { HANDLE_STUB_MODEL, HANDLE_STUB_PROMPT_VERSION, normaliseHandle, screenHandleWithStub } from "./handle-stub";

describe("screenHandleWithStub", () => {
  it.each(["Jane_Smith", "Strategist42", "badminton_fan", "skillful", "Modern_History", "Supporter"])("allows %s", (handle) => {
    expect(screenHandleWithStub(handle).outcome).toBe("allow");
  });

  it.each(["admin", "Admin_1", "Adm1n", "the_moderator", "Official_TGS", "GrandStrategist99", "support"])(
    "blocks impersonation: %s",
    (handle) => {
      const result = screenHandleWithStub(handle);
      expect(result.outcome).toBe("block");
      expect(result.output.category).toBe("impersonation");
    },
  );

  it.each(["hitler_fan", "N4zi", "kill_them", "xpaedox"])("blocks abuse: %s", (handle) => {
    const result = screenHandleWithStub(handle);
    expect(result.outcome).toBe("block");
    expect(result.output.category).toBe("abuse");
  });

  it("records the model, prompt version and a plain reason for every decision", () => {
    for (const handle of ["Jane", "admin"]) {
      const result = screenHandleWithStub(handle);
      expect(result.model).toBe(HANDLE_STUB_MODEL);
      expect(result.promptVersion).toBe(HANDLE_STUB_PROMPT_VERSION);
      expect(result.reason.length).toBeGreaterThan(5);
    }
  });

  it("undoes look-alike characters", () => {
    expect(normaliseHandle("4dm1n")).toBe("admin");
  });
});
