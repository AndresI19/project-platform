import { describe, expect, it } from "vitest";
import {
  codeLookup, generateCode, isValidUsername, isWellFormed, lookupsEqual, normaliseCode, normaliseUsername,
} from "../src/code.js";

describe("the code", () => {
  it("is seven characters of the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toHaveLength(7);
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{7}$/); // no I, L, O, U
    }
  });

  it("never emits a character that looks like another one", () => {
    const codes = Array.from({ length: 500 }, generateCode).join("");
    for (const banned of ["I", "L", "O", "U"]) expect(codes).not.toContain(banned);
  });

  it("does not repeat itself", () => {
    // Not a randomness test — just a smoke check that we are not handing everyone the same code.
    const seen = new Set(Array.from({ length: 1000 }, generateCode));
    expect(seen.size).toBe(1000);
  });
});

describe("normalisation", () => {
  it("folds the characters people actually mistype", () => {
    // A user reading 4KP7R2M off a screen may type l for 1 and o for 0. Rejecting that would be
    // technically correct and practically hostile.
    expect(normaliseCode("4kp7r2m")).toBe("4KP7R2M");
    expect(normaliseCode("l0ABCDE")).toBe("10ABCDE");
    expect(normaliseCode("IOABCDE")).toBe("10ABCDE");
    expect(normaliseCode(" 4KP-7R2M ")).toBe("4KP7R2M");
  });

  it("rejects anything that is not a code", () => {
    expect(isWellFormed("SHORT")).toBe(false);
    expect(isWellFormed("TOOLONGCODE")).toBe(false);
    expect(isWellFormed("4KP7R2M")).toBe(true);
  });
});

describe("the stored lookup", () => {
  const pepper = "x".repeat(32);

  it("is deterministic, so a login is one indexed read", () => {
    expect(codeLookup("4KP7R2M", pepper)).toBe(codeLookup("4KP7R2M", pepper));
  });

  it("is useless without the pepper — a stolen dump reveals nothing", () => {
    expect(codeLookup("4KP7R2M", pepper)).not.toBe(codeLookup("4KP7R2M", "y".repeat(32)));
  });

  it("never contains the code itself", () => {
    expect(codeLookup("4KP7R2M", pepper)).not.toContain("4KP7R2M");
  });

  it("compares without leaking how much matched", () => {
    const a = codeLookup("4KP7R2M", pepper);
    expect(lookupsEqual(a, a)).toBe(true);
    expect(lookupsEqual(a, codeLookup("4KP7R2N", pepper))).toBe(false);
  });
});

describe("usernames", () => {
  it("accepts what people actually want to be called", () => {
    for (const ok of ["andres", "zezima", "a_b-c", "user123", "abc"]) {
      expect(isValidUsername(ok)).toBe(true);
    }
  });

  it("rejects the shapes that would make a username an impersonation vector", () => {
    expect(isValidUsername("ab")).toBe(false);          // too short to be distinctive
    expect(isValidUsername("a".repeat(21))).toBe(false);
    expect(isValidUsername("_leading")).toBe(false);     // leading separator
    expect(isValidUsername("trailing-")).toBe(false);
    expect(isValidUsername("has space")).toBe(false);
    expect(isValidUsername("Andres")).toBe(false);       // must be normalised first
  });

  it("is case-insensitive, so Andres and andres cannot both exist", () => {
    // Not a nicety. Two identities differing only in case would let anyone impersonate anyone with a
    // shift key — the username is the PUBLIC identity, and it has to actually identify.
    expect(normaliseUsername("  Andres ")).toBe("andres");
    expect(normaliseUsername("ANDRES")).toBe(normaliseUsername("andres"));
  });
});
