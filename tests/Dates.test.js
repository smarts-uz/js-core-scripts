// Unit tests for utils/Dates.js — all public (non-_) static methods.
// Dates is pure logic (dayjs date math + string/number helpers), so it is
// tested directly with concrete and property-based (fast-check) assertions.
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { test as fcTest, fc } from '@fast-check/jest';
import { Dates } from '../utils/Dates.js';

describe('Dates.parseDMY', () => {
  it('parses a DD.MM.YYYY string into a local Date', () => {
    const d = Dates.parseDMY('03.11.2011');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2011);
    expect(d.getMonth()).toBe(10); // November = month index 10
    expect(d.getDate()).toBe(3);
  });

  it('treats the first component as the day', () => {
    const d = Dates.parseDMY('28.12.2018');
    expect(d.getDate()).toBe(28);
    expect(d.getMonth()).toBe(11);
  });
});

describe('Dates.parseDMYExcel', () => {
  it('parses a YYYY-MM-DD string into a local Date', () => {
    const d = Dates.parseDMYExcel('2023-08-10');
    expect(d.getFullYear()).toBe(2023);
    expect(d.getMonth()).toBe(7); // August
    expect(d.getDate()).toBe(10);
  });
});

describe('Dates.getMinusOneDay', () => {
  it('returns the last day of the previous month', () => {
    expect(Dates.getMinusOneDay('2025-11-06')).toBe('2025-10-31');
  });

  it('handles year boundaries', () => {
    expect(Dates.getMinusOneDay('2025-01-15')).toBe('2024-12-31');
  });

  it('returns a YYYY-MM-DD string', () => {
    expect(Dates.getMinusOneDay('2024-03-09')).toBeDateYMD();
  });
});

describe('Dates.didoxToExcel', () => {
  it('converts DD.MM.YYYY to YYYY-MM-DD', () => {
    expect(Dates.didoxToExcel('10.08.2023')).toBe('2023-08-10');
  });

  it('returns empty string for falsy input', () => {
    expect(Dates.didoxToExcel('')).toBe('');
    expect(Dates.didoxToExcel(null)).toBe('');
    expect(Dates.didoxToExcel(undefined)).toBe('');
  });

  it('leaves non-matching strings unchanged', () => {
    expect(Dates.didoxToExcel('not-a-date')).toBe('not-a-date');
  });
});

describe('Dates.excelToDidox', () => {
  it('converts YYYY-MM-DD to DD.MM.YYYY', () => {
    expect(Dates.excelToDidox('2023-08-10')).toBe('10.08.2023');
  });

  it('returns empty string for falsy input', () => {
    expect(Dates.excelToDidox('')).toBe('');
    expect(Dates.excelToDidox(null)).toBe('');
  });

  it('round-trips with didoxToExcel', () => {
    expect(Dates.didoxToExcel(Dates.excelToDidox('2023-08-10'))).toBe('2023-08-10');
  });
});

describe('Dates.addYearsGetLastDate', () => {
  it('adds N years and snaps to 31 December', () => {
    expect(Dates.addYearsGetLastDate('15.06.2020', 2)).toBe('31.12.2022');
  });

  it('returns a DD.MM.YYYY string', () => {
    expect(Dates.addYearsGetLastDate('01.01.2024', 0)).toBeDateDMY();
    expect(Dates.addYearsGetLastDate('01.01.2024', 0)).toBe('31.12.2024');
  });
});

describe('Dates.addDays', () => {
  it('adds days within a month', () => {
    expect(Dates.addDays('01.01.2020', 30)).toBe('31.01.2020');
  });

  it('rolls over month boundaries', () => {
    expect(Dates.addDays('25.12.2020', 10)).toBe('04.01.2021');
  });

  it('returns a DD.MM.YYYY string', () => {
    expect(Dates.addDays('10.10.2020', 5)).toBeDateDMY();
  });
});

describe('Dates.futureDateByMonth', () => {
  it('returns the first day of the month N months ahead', () => {
    const out = Dates.futureDateByMonth(2);
    expect(out).toBeDateYMD();
    expect(out.slice(-2)).toBe('01');
  });

  it('returns the last day of the prior month when prevMonthLastDate is true', () => {
    const out = Dates.futureDateByMonth(2, true);
    expect(out).toBeDateYMD();
    // last day of a month is never the 1st
    expect(out.slice(-2)).not.toBe('01');
  });

  it('accepts a numeric string for months', () => {
    expect(Dates.futureDateByMonth('1')).toBeDateYMD();
  });
});

describe('Dates.randomInt', () => {
  it('returns a value within [min, max] inclusive', () => {
    for (let i = 0; i < 200; i++) {
      const r = Dates.randomInt(5, 10);
      expect(r).toBeGreaterThanOrEqual(5);
      expect(r).toBeLessThanOrEqual(10);
      expect(Number.isInteger(r)).toBe(true);
    }
  });

  it('returns the single value when min === max', () => {
    expect(Dates.randomInt(7, 7)).toBe(7);
  });

  fcTest.prop([fc.integer({ min: -1000, max: 1000 }), fc.nat({ max: 1000 })])(
    'is always an integer within range (property)',
    (min, delta) => {
      const max = min + delta;
      const r = Dates.randomInt(min, max);
      return Number.isInteger(r) && r >= min && r <= max;
    }
  );
});

describe('Dates.randomIntOne', () => {
  it('returns a value within [floor(3/4·v), v]', () => {
    for (let i = 0; i < 200; i++) {
      const r = Dates.randomIntOne(100);
      expect(r).toBeGreaterThanOrEqual(75);
      expect(r).toBeLessThanOrEqual(100);
    }
  });
});

describe('Dates.normalizeUzAccordingToRule', () => {
  it('formats a bare 9-digit number', () => {
    expect(Dates.normalizeUzAccordingToRule('901234567')).toBe('+998-90-123-45-67');
  });

  it('keeps an already-prefixed 998 number', () => {
    expect(Dates.normalizeUzAccordingToRule('998901234567')).toBe('+998-90-123-45-67');
  });

  it('strips a leading 0 from a 10-digit number', () => {
    expect(Dates.normalizeUzAccordingToRule('0901234567')).toBe('+998-90-123-45-67');
  });

  it('formats noisy input with separators', () => {
    expect(Dates.normalizeUzAccordingToRule('+998 (90) 123-45-67')).toBeUzbekPhone();
  });

  it('returns the raw value when too short', () => {
    expect(Dates.normalizeUzAccordingToRule('12345')).toBe('12345');
  });

  it('returns the raw value for non-string input', () => {
    expect(Dates.normalizeUzAccordingToRule(null)).toBeNull();
    expect(Dates.normalizeUzAccordingToRule(12345)).toBe(12345);
  });
});

describe('Dates.compareDatesDMY', () => {
  it('returns a negative number when a < b', () => {
    expect(Dates.compareDatesDMY('03.11.2011', '28.12.2018')).toBeLessThan(0);
  });

  it('returns a positive number when a > b', () => {
    expect(Dates.compareDatesDMY('28.12.2018', '03.11.2011')).toBeGreaterThan(0);
  });

  it('returns 0 for equal dates', () => {
    expect(Dates.compareDatesDMY('01.01.2020', '01.01.2020')).toBe(0);
  });
});

describe('Dates.sleep / sleepOne / sleepSync', () => {
  afterEach(() => jest.useRealTimers());

  it('sleep(ms, false) resolves after the given delay', async () => {
    const start = Date.now();
    await Dates.sleep(20, false);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it('sleep applies randomIntOne when random is true', async () => {
    const spy = jest.spyOn(Dates, 'randomIntOne').mockReturnValue(5);
    await Dates.sleep(1000, true);
    expect(spy).toHaveBeenCalledWith(1000);
    spy.mockRestore();
  });

  it('sleepOne resolves to undefined', async () => {
    await expect(Dates.sleepOne(10)).resolves.toBeUndefined();
  });

  it('sleepSync returns undefined without blocking', () => {
    expect(Dates.sleepSync(5)).toBeUndefined();
  });
});

describe('Dates.run', () => {
  it('throws because it references an unqualified compareDatesDMY', () => {
    // run() calls `compareDatesDMY(...)` instead of `Dates.compareDatesDMY(...)`,
    // which is a ReferenceError — this test documents that real behavior.
    expect(() => Dates.run()).toThrow(ReferenceError);
  });
});
