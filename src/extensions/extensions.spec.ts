import { TestBed } from '@angular/core/testing';

import { rational } from '~/rational/rational';
import { initialPreferencesState } from '~/state/preferences/preferences-state';
import { initialSettingsState } from '~/state/settings/settings-state';

import {
  CALCULATION_EXTENSION,
  emptyModelRules,
} from './calculation-extension';
import { immutableValue } from './immutable';
import { PRESENTATION_EXTENSION } from './presentation-extension';
import {
  cloneDefaults,
  EFFECTIVE_DEFAULTS,
  PRODUCT_PROFILE,
  upstreamProduct,
} from './product-profile';
import { STATE_EXTENSION, WorkspaceRestoreError } from './state-extension';
import { WorkspaceLifecycle } from './workspace-lifecycle';

describe('Neutral extension defaults', () => {
  it('uses the unmodified upstream defaults without product providers', () => {
    expect(TestBed.inject(PRODUCT_PROFILE)).toBe(upstreamProduct);
    const defaults = TestBed.inject(EFFECTIVE_DEFAULTS);
    expect(cloneDefaults(defaults).settings).toEqual(initialSettingsState);
    expect(cloneDefaults(defaults).preferences).toEqual(
      initialPreferencesState,
    );
    expect(defaults.settings).not.toBe(initialSettingsState);
    expect(defaults.preferences).not.toBe(initialPreferencesState);
  });

  it('isolates mutable nested defaults from state edits and subsequent resets', () => {
    const snapshot = upstreamProduct.defaults();
    const state = cloneDefaults(snapshot);
    state.settings.checkedItemIds.add('edited');
    state.preferences.columns.items.show =
      !snapshot.preferences.columns.items.show;
    state.preferences.states['test'] = { saved: '?o=test' };
    state.preferences.flowSettings.hideExcluded =
      !snapshot.preferences.flowSettings.hideExcluded;
    expect(cloneDefaults(snapshot)).toEqual(
      cloneDefaults(upstreamProduct.defaults()),
    );
  });

  it('provides runtime immutable sets, objects and arrays at extension boundaries', () => {
    const snapshot = immutableValue({
      selected: new Set(['original']),
      nested: { rate: 1 },
      ids: ['original'],
    });
    expect(Reflect.get(snapshot.selected, 'add')).toBeUndefined();
    expect(() => Object.assign(snapshot.nested, { rate: 2 })).toThrow();
    expect(() => Array.prototype.push.call(snapshot.ids, 'changed')).toThrow();
    expect(Array.from(snapshot.selected)).toEqual(['original']);
  });

  it('has an empty state codec and model rules by default', () => {
    const extension = TestBed.inject(STATE_EXTENSION);
    const input = { modId: 'test', params: { v: '12' } };
    expect(extension.prepare(input)).toEqual(input);
    expect(extension.snapshot()).toBeUndefined();
    expect(extension.encode(undefined)).toEqual({});
    const calculation = TestBed.inject(CALCULATION_EXTENSION);
    expect(calculation.rules({} as never, [])).toBe(emptyModelRules);
    expect(calculation.derive({} as never)).toEqual([]);
    expect(TestBed.inject(PRESENTATION_EXTENSION).mainPanels).toEqual([]);
  });

  it('isolates and freezes Rational values without mutating shared constants', () => {
    const original = rational.one;
    const snapshot = immutableValue({ value: original });
    expect(snapshot.value).not.toBe(original);
    expect(snapshot.value.eq(original)).toBeTrue();
    expect(() => Object.assign(snapshot.value, { p: 2n })).toThrow();
    expect(original.p).toBe(1n);
    expect(snapshot.value.mul(rational(2)).toString()).toBe('2');
  });

  it('retains structured restore errors', () => {
    const diagnostic = {
      code: 'version',
      message: 'Unsupported version',
      severity: 'error',
    } as const;
    const error = new WorkspaceRestoreError([diagnostic]);
    expect(error.message).toBe(diagnostic.message);
    expect(error.diagnostics).toEqual([diagnostic]);
  });
});

describe('Workspace recovery lifecycle', () => {
  it('rejects obsolete navigation completions and errors', () => {
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    const old = lifecycle.begin('?old');
    const current = lifecycle.begin('?current');
    expect(lifecycle.complete(old)).toBeFalse();
    lifecycle.fail(old, [
      { code: 'old', message: 'obsolete', severity: 'error' },
    ]);
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()).toEqual([]);
    expect(lifecycle.originalInput()).toBe('?current');
    expect(lifecycle.complete(current)).toBeTrue();
    expect(lifecycle.ready()).toBeTrue();
  });

  it('keeps failed input and blocks writeback until a valid restoration', () => {
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    const ticket = lifecycle.begin('?invalid');
    lifecycle.fail(ticket, [
      { code: 'decode', message: 'Invalid input', severity: 'error' },
    ]);
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.originalInput()).toBe('?invalid');
    expect(lifecycle.diagnostics()[0].code).toBe('decode');
    lifecycle.complete(lifecycle.begin('?valid'));
    expect(lifecycle.ready()).toBeTrue();
    expect(lifecycle.diagnostics()).toEqual([]);
  });

  it('cannot mark an error diagnostic as a successful restoration', () => {
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    expect(
      lifecycle.complete(lifecycle.begin('?invalid'), [
        { code: 'invalid', message: 'Invalid', severity: 'error' },
      ]),
    ).toBeFalse();
    expect(lifecycle.ready()).toBeFalse();
  });
});
