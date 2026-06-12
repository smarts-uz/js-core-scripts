// Smoke test: verifies the native-ESM Jest harness, jest-extended matchers,
// the @fast-check/jest property runner and our custom matchers all load.
import { describe, it, expect } from '@jest/globals';
import { test as fcTest, fc } from '@fast-check/jest';

describe('harness smoke test', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('has jest-extended matchers', () => {
    expect([1, 2, 3]).toBeArray();
    expect('hello').toBeString();
    expect(3).toBeOneOf([1, 2, 3]);
  });

  it('has our custom domain matchers', () => {
    expect('+998-90-123-45-67').toBeUzbekPhone();
    expect('not a phone').not.toBeUzbekPhone();
    expect('Report 2025').toBeSafeWindowsName();
    expect('bad:name').not.toBeSafeWindowsName();
    expect('01.02.2030').toBeDateDMY();
    expect('2030-02-01').toBeDateYMD();
  });

  it('can dynamically import an ESM utils class', async () => {
    const { Dates } = await import('../utils/Dates.js');
    expect(Dates).toBeFunction();
  });

  fcTest.prop([fc.integer(), fc.integer()])('property runner works', (a, b) => {
    expect(a + b).toBe(b + a);
  });
});
