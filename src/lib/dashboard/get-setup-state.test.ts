import { describe, expect, it } from "vitest";
import { resolveSetupState } from "./get-setup-state";

describe("resolveSetupState", () => {
  // Los ocho combos: `complete` solo es verdadero con los tres a la vez.
  const cases: Array<[boolean, boolean, boolean, boolean]> = [
    [false, false, false, false],
    [true, false, false, false],
    [false, true, false, false],
    [false, false, true, false],
    [true, true, false, false],
    [true, false, true, false],
    [false, true, true, false],
    [true, true, true, true],
  ];

  it.each(cases)(
    "provider=%s account=%s statement=%s → complete=%s",
    (hasProvider, hasAccount, hasStatement, complete) => {
      const state = resolveSetupState({ hasProvider, hasAccount, hasStatement });
      expect(state.complete).toBe(complete);
      expect(state).toMatchObject({ hasProvider, hasAccount, hasStatement });
    },
  );
});
