import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isValidPassword,
  isValidUsername,
  normaliseUsername,
  verifyPassword,
} from "../src/credential.js";

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

describe("password rules", () => {
  it("requires a floor of length, the only entropy we can enforce on a chosen secret", () => {
    expect(isValidPassword("abc")).toBe(false);         // 3 chars — below the 4-char floor
    expect(isValidPassword("pin4")).toBe(true);         // 4 chars — the floor
    expect(isValidPassword("goodenough")).toBe(true);   // 10 chars
    expect(isValidPassword("a".repeat(128))).toBe(true);
    expect(isValidPassword("a".repeat(129))).toBe(false);
  });

  it("rejects anything that is not a string", () => {
    expect(isValidPassword(undefined)).toBe(false);
    expect(isValidPassword(12345678)).toBe(false);
    expect(isValidPassword(null)).toBe(false);
  });
});

describe("the stored password hash", () => {
  const pepper = "x".repeat(32);

  it("round-trips: the password it was made from verifies, a near-miss does not", async () => {
    const stored = await hashPassword("correct horse battery", pepper);
    expect(await verifyPassword(stored, "correct horse battery", pepper)).toBe(true);
    expect(await verifyPassword(stored, "correct horse batttery", pepper)).toBe(false);
  });

  it("is salted, so the same password hashes to two different values", async () => {
    const a = await hashPassword("same-password-twice", pepper);
    const b = await hashPassword("same-password-twice", pepper);
    expect(a).not.toBe(b);
    // ...and both still verify, because the salt travels inside the stored value.
    expect(await verifyPassword(a, "same-password-twice", pepper)).toBe(true);
    expect(await verifyPassword(b, "same-password-twice", pepper)).toBe(true);
  });

  it("is useless without the pepper — a stolen dump reveals nothing", async () => {
    const stored = await hashPassword("dump-me", pepper);
    // An attacker with the table (and thus the salt) but not the pepper cannot verify the real password.
    expect(await verifyPassword(stored, "dump-me", "y".repeat(32))).toBe(false);
  });

  it("never contains the password itself", async () => {
    const stored = await hashPassword("plaintext-should-not-appear", pepper);
    expect(stored).not.toContain("plaintext-should-not-appear");
  });

  it("names its own parameters, so a corrupt or foreign value is a deny, not a crash", async () => {
    const stored = await hashPassword("well-formed", pepper);
    expect(stored.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("not-a-hash", "well-formed", pepper)).toBe(false);
    expect(await verifyPassword("scrypt$bad$params$here$x$y", "well-formed", pepper)).toBe(false);
    expect(await verifyPassword("", "well-formed", pepper)).toBe(false);
  });
});
