import { TestBed } from '@angular/core/testing';

import { rational } from '~/rational/rational';
import { initialPreferencesState } from '~/state/preferences/preferences-state';
import { initialSettingsState } from '~/state/settings/settings-state';

import {
  CALCULATION_EXTENSION,
  emptyModelRules,
} from './calculation-extension';
import { immutableValue, mutableValue } from './immutable';
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
    expect(
      calculation.cost({ adjusted: { cost: rational(7) } } as never),
    ).toEqual(rational(7));
    expect(extension.preflight({} as never)).toEqual([]);
    expect(TestBed.inject(PRESENTATION_EXTENSION).mainPanels).toEqual([]);
  });

  it('keeps the read-only Set contract and isolates results of set operations', () => {
    const set = immutableValue(new Set(['a', 'b']));
    expect(set.size).toBe(2);
    expect([...set.entries()]).toEqual([
      ['a', 'a'],
      ['b', 'b'],
    ]);
    expect([...set.keys()]).toEqual(['a', 'b']);
    expect([...set.values()]).toEqual(['a', 'b']);
    expect(set.union(new Set(['c']))).toEqual(new Set(['a', 'b', 'c']));
    expect(set.intersection(new Set(['b', 'c']))).toEqual(new Set(['b']));
    expect(set.difference(new Set(['b']))).toEqual(new Set(['a']));
    expect(set.symmetricDifference(new Set(['b', 'c']))).toEqual(
      new Set(['a', 'c']),
    );
    expect(set.isSubsetOf(new Set(['a', 'b', 'c']))).toBeTrue();
    expect(set.isSupersetOf(new Set(['b']))).toBeTrue();
    expect(set.isDisjointFrom(new Set(['c']))).toBeTrue();
    const context = { values: [] as string[] };
    set.forEach(function (this: typeof context, first, second, readonlySet) {
      expect(first).toBe(second);
      expect(readonlySet).toBe(set);
      expect(Reflect.get(readonlySet, 'delete')).toBeUndefined();
      this.values.push(first);
    }, context);
    expect(context.values).toEqual(['a', 'b']);
    const union = set.union(new Set(['c']));
    union.clear();
    expect([...set]).toEqual(['a', 'b']);
    const value = { rate: rational(7), owners: [new Set(['a'])] };
    const copy = mutableValue<typeof value>(immutableValue(value));
    copy.owners[0].add('b');
    expect(value.owners[0]).toEqual(new Set(['a']));
    expect(copy.rate).not.toBe(value.rate);
    expect(copy.rate.eq(value.rate)).toBeTrue();
  });

  it('does not acquire editing or ownership effects from the default presentation', () => {
    const presentation = TestBed.inject(PRESENTATION_EXTENSION);
    expect(presentation.costsModified()).toBeFalse();
    presentation.resetCosts();
    const owner = { kind: 'objective', id: '1' } as const;
    expect(presentation.showNames()).toBeFalse();
    presentation.toggleNames();
    expect(presentation.showNames()).toBeFalse();
    expect(presentation.hideDuplicateIcons()).toBeFalse();
    expect(presentation.hideProducer('recipe')).toBeFalse();
    expect(presentation.forceLabel('recipe')).toBeFalse();
    expect(presentation.owner({ id: '1' })).toBeUndefined();
    expect(
      presentation.updateRecipeField(owner, 'cost', rational.one),
    ).toBeFalse();
    expect(presentation.resetRecipe(owner)).toBeFalse();
    expect(presentation.checked({ id: '1' })).toBeUndefined();
    expect(presentation.toggleChecked({ id: '1' }, true)).toBeFalse();
    presentation.clearChecked();
    expect(presentation.hasChecked()).toBeFalse();
    expect(presentation.modified(owner)).toBeFalse();
    presentation.resetRecipes(['cost']);
    expect(presentation.sourceLabel({ id: '1' })).toBeUndefined();
    expect(presentation.workspaceLink({ id: '1' })).toBeFalse();
    expect(presentation.stepFragment({ id: '1' })).toBeUndefined();
    const state = TestBed.inject(STATE_EXTENSION);
    state.commit({ extra: 'ignored' });
    state.reset();
    expect(state.snapshot()).toBeUndefined();
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
