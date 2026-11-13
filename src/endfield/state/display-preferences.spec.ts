import { TestBed } from '@angular/core/testing';

import { EndfieldDisplayPreferences } from './display-preferences';

const key = 'endfield.presentation';
const legacyKey = 'preferences';
const backupKey = 'preferences.recovery.endfield.presentation';
const belongsToTest = (value: string): boolean =>
  value === key ||
  value === legacyKey ||
  value === backupKey ||
  value.startsWith(`${backupKey}.`);

/** Operate on real Storage while restoring any pre-existing values after each test. */
describe('EndfieldDisplayPreferences', () => {
  let original: Map<string, string>;
  let get: jasmine.Spy;
  let set: jasmine.Spy;
  let realGet: (key: string) => string | null;
  let realSet: (key: string, value: string) => void;

  function keys(): string[] {
    return Array.from({ length: localStorage.length }, (_, i) =>
      localStorage.key(i),
    ).filter((value): value is string => value != null && belongsToTest(value));
  }

  function create(): EndfieldDisplayPreferences {
    return TestBed.runInInjectionContext(
      () => new EndfieldDisplayPreferences(),
    );
  }

  beforeEach(() => {
    original = new Map(
      keys().map((name) => [name, localStorage.getItem(name) ?? '']),
    );
    for (const name of keys()) localStorage.removeItem(name);
    realGet = Storage.prototype.getItem;
    realSet = Storage.prototype.setItem;
    get = spyOn(Storage.prototype, 'getItem').and.callThrough();
    set = spyOn(Storage.prototype, 'setItem').and.callThrough();
  });

  afterEach(() => {
    get.and.callThrough();
    set.and.callThrough();
    TestBed.tick();
    for (const name of keys()) localStorage.removeItem(name);
    for (const [name, value] of original) localStorage.setItem(name, value);
  });

  it('uses immutable defaults, persists toggles, and does not mutate prior snapshots', () => {
    const preferences = create();
    const before = preferences.state();
    expect(before).toEqual({ showNames: false, hideDuplicateIcons: true });
    expect(Object.isFrozen(before)).toBeTrue();
    expect(() => Object.assign(before, { showNames: true })).toThrow();
    preferences.toggleNames();
    TestBed.tick();
    expect(preferences.state().showNames).toBeTrue();
    expect(before.showNames).toBeFalse();
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toEqual({
      showNames: true,
      hideDuplicateIcons: true,
    });
    expect(preferences.migrationWarnings()).toEqual([]);
  });

  it('preserves valid local values over the legacy preference and ignores unknown keys', () => {
    localStorage.setItem(legacyKey, '{"hideDuplicateIcons":false}');
    localStorage.setItem(
      key,
      '{"showNames":true,"hideDuplicateIcons":true,"future":12}',
    );
    const preferences = create();
    expect(preferences.state()).toEqual({
      showNames: true,
      hideDuplicateIcons: true,
    });
    expect(preferences.migrationWarnings()).toEqual([]);
    expect(localStorage.getItem(backupKey)).toBeNull();
  });

  it('salvages valid fields and preserves the exact damaged raw value before writing', () => {
    const raw =
      '{ "showNames": true, "hideDuplicateIcons": "bad", "future": 9 }';
    localStorage.setItem(legacyKey, '{"hideDuplicateIcons":false}');
    localStorage.setItem(key, raw);
    set.calls.reset();
    const preferences = create();
    expect(preferences.state()).toEqual({
      showNames: true,
      hideDuplicateIcons: false,
    });
    expect(preferences.migrationWarnings()).toContain(
      'endfield.recovery.displayDamaged',
    );
    expect(Object.isFrozen(preferences.migrationWarnings())).toBeTrue();
    expect(localStorage.getItem(backupKey)).toBe(raw);
    expect(localStorage.getItem(key)).toBe(raw);
    expect(set.calls.allArgs()[0]).toEqual([backupKey, raw]);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toEqual({
      showNames: true,
      hideDuplicateIcons: false,
    });
    expect(localStorage.getItem(backupKey)).toBe(raw);
  });

  it('backs up malformed JSON and non-object values without losing distinct originals or duplicating a sparse backup', () => {
    const originals = ['{bad', 'null', '[]', '"string"', ''];
    for (const [index, raw] of originals.entries()) {
      localStorage.setItem(key, raw);
      const preferences = create();
      expect(preferences.state()).toEqual({
        showNames: false,
        hideDuplicateIcons: true,
      });
      expect(preferences.migrationWarnings()).toContain(
        'endfield.recovery.displayDamaged',
      );
      expect(
        localStorage.getItem(index === 0 ? backupKey : `${backupKey}.${index}`),
      ).toBe(raw);
      TestBed.tick();
    }
    localStorage.removeItem(backupKey);
    localStorage.setItem(key, originals[1]);
    create();
    expect(localStorage.getItem(backupKey)).toBeNull();
    expect(localStorage.getItem(`${backupKey}.1`)).toBe(originals[1]);
    expect(keys().filter((name) => name.startsWith(backupKey))).toHaveSize(4);
  });

  it('does not overwrite damaged input when backup fails and continues in memory', () => {
    const raw = '{"showNames":true,"hideDuplicateIcons":0}';
    localStorage.setItem(key, raw);
    set.calls.reset();
    set.and.callFake((name: string, value: string): void => {
      if (name.startsWith(backupKey)) throw new Error('quota');
      realSet.call(localStorage, name, value);
    });
    spyOn(console, 'warn');
    const preferences = create();
    expect(preferences.state()).toEqual({
      showNames: true,
      hideDuplicateIcons: true,
    });
    expect(preferences.migrationWarnings()).toContain(
      'endfield.recovery.displayBackupFailed',
    );
    preferences.toggleNames();
    TestBed.tick();
    expect(preferences.state().showNames).toBeFalse();
    expect(localStorage.getItem(key)).toBe(raw);
    expect(set.calls.allArgs().some(([name]) => name === key)).toBeFalse();
  });

  it('recognizes an existing zero-suffixed backup without adding a duplicate', () => {
    const raw = '{"showNames":"invalid"}';
    localStorage.setItem(`${backupKey}.0`, raw);
    localStorage.setItem(key, raw);
    const preferences = create();
    expect(preferences.migrationWarnings()).toContain(
      'endfield.recovery.displayDamaged',
    );
    expect(localStorage.getItem(backupKey)).toBeNull();
    expect(localStorage.getItem(`${backupKey}.0`)).toBe(raw);
  });

  it('keeps the original if a storage implementation silently fails to create a backup', () => {
    const raw = '{"showNames":null}';
    localStorage.setItem(key, raw);
    set.calls.reset();
    set.and.callFake((name: string, value: string): void => {
      if (name !== backupKey) realSet.call(localStorage, name, value);
    });
    const preferences = create();
    expect(preferences.migrationWarnings()).toContain(
      'endfield.recovery.displayBackupFailed',
    );
    preferences.toggleNames();
    TestBed.tick();
    expect(localStorage.getItem(key)).toBe(raw);
    expect(set.calls.allArgs().some(([name]) => name === key)).toBeFalse();
  });

  it('does not write when either storage read fails', () => {
    const raw = '{"showNames":true}';
    localStorage.setItem(key, raw);
    get.and.callFake((name: string): string | null => {
      if (name === key) throw new Error('unavailable');
      return realGet.call(localStorage, name);
    });
    set.calls.reset();
    const preferences = create();
    expect(preferences.migrationWarnings()).toContain(
      'endfield.recovery.displayStorageUnavailable',
    );
    preferences.toggleNames();
    TestBed.tick();
    get.and.callThrough();
    expect(localStorage.getItem(key)).toBe(raw);
    expect(set.calls.allArgs().some(([name]) => name === key)).toBeFalse();
  });

  it('reports one storage warning when both preference reads fail', () => {
    const raw = '{"showNames":true}';
    localStorage.setItem(key, raw);
    get.and.callFake((name: string): string | null => {
      if (name === legacyKey || name === key) throw new Error('unavailable');
      return realGet.call(localStorage, name);
    });
    set.calls.reset();
    const preferences = create();
    expect(preferences.state()).toEqual({
      showNames: false,
      hideDuplicateIcons: true,
    });
    expect(preferences.migrationWarnings()).toEqual([
      'endfield.recovery.displayStorageUnavailable',
    ]);
    preferences.toggleNames();
    TestBed.tick();
    get.and.callThrough();
    expect(localStorage.getItem(key)).toBe(raw);
    expect(set.calls.allArgs().some(([name]) => name === key)).toBeFalse();
  });

  it('keeps valid local settings when legacy data is malformed or inaccessible', () => {
    localStorage.setItem(legacyKey, '{bad');
    localStorage.setItem(key, '{"showNames":true,"hideDuplicateIcons":false}');
    const preferences = create();
    expect(preferences.state()).toEqual({
      showNames: true,
      hideDuplicateIcons: false,
    });
    expect(preferences.migrationWarnings()).toEqual([]);
    TestBed.tick();
    get.and.callFake((name: string): string | null => {
      if (name === legacyKey) throw new Error('unavailable');
      return realGet.call(localStorage, name);
    });
    set.calls.reset();
    const inaccessible = create();
    expect(inaccessible.state()).toEqual({
      showNames: true,
      hideDuplicateIcons: false,
    });
    expect(inaccessible.migrationWarnings()).toContain(
      'endfield.recovery.displayStorageUnavailable',
    );
    inaccessible.toggleNames();
    TestBed.tick();
    expect(set.calls.allArgs().some(([name]) => name === key)).toBeFalse();
  });

  it('retains in-memory changes when persistence itself fails', () => {
    set.and.throwError('storage unavailable');
    spyOn(console, 'warn');
    const preferences = create();
    preferences.toggleNames();
    TestBed.tick();
    expect(preferences.state().showNames).toBeTrue();
    expect(console.warn).toHaveBeenCalled();
  });
});
