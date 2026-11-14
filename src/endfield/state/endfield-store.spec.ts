import { TestBed } from '@angular/core/testing';

import {
  createEndfieldState,
  ovenId,
  resourceOwner,
} from '~/endfield/domain/model';
import { rational } from '~/rational/rational';

import { EndfieldStore } from './endfield-store';

describe('EndfieldStore', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [EndfieldStore] }),
  );

  it('keeps earlier snapshots through source edits, reset and restore', () => {
    const store = TestBed.inject(EndfieldStore);
    const initial = createEndfieldState();
    store.set({
      ...initial,
      resourceLimits: {
        enabled: true,
        rates: { ...initial.resourceLimits.rates, copper_ore: rational(5) },
      },
      machineLimits: { enabled: true, limits: { [ovenId]: rational(7) } },
      transfer: { enabled: true, source: 'tundra' },
      checkedDerived: new Set([resourceOwner('copper_ore')]),
      resourceRecipeSettings: {
        copper_ore: { machineId: 'miner_4', overclock: rational(125) },
      },
      electric: rational(2),
    });
    const snapshot = store.snapshot();
    store.setResourceChecked('copper_ore', false);
    store.updateResourceRecipeField('copper_ore', 'machineId', 'miner_2');
    const edited = store.snapshot();
    expect(edited.checkedDerived.has(resourceOwner('copper_ore'))).toBeFalse();
    expect(edited.resourceRecipeSettings.copper_ore).toEqual({
      machineId: 'miner_2',
      overclock: rational(125),
    });
    expect(snapshot.checkedDerived.has(resourceOwner('copper_ore'))).toBeTrue();
    expect(snapshot.resourceRecipeSettings.copper_ore).toEqual({
      machineId: 'miner_4',
      overclock: rational(125),
    });
    expect(snapshot.resourceLimits).toEqual({
      enabled: true,
      rates: { ...initial.resourceLimits.rates, copper_ore: rational(5) },
    });
    expect(snapshot.machineLimits).toEqual({
      enabled: true,
      limits: { [ovenId]: rational(7) },
    });
    expect(snapshot.transfer.enabled).toBeTrue();
    expect(snapshot.electric).toEqual(rational(2));

    store.reset();
    expect(store.snapshot()).toEqual(createEndfieldState());
    expect(edited.resourceRecipeSettings.copper_ore?.machineId).toBe('miner_2');
    expect(snapshot.checkedDerived.has(resourceOwner('copper_ore'))).toBeTrue();
    store.set(snapshot);
    expect(store.snapshot()).toEqual(snapshot);
  });

  it('isolates per-resource edits and resets without changing physical rates or checks', () => {
    const store = TestBed.inject(EndfieldStore);
    const initial = createEndfieldState();
    store.set({
      ...initial,
      resourceLimits: {
        enabled: true,
        rates: {
          ...initial.resourceLimits.rates,
          originium_ore: rational(560, 60),
        },
      },
      resourceRecipeSettings: {
        originium_ore: { machineId: 'miner_2', overclock: rational(150) },
        copper_ore: { machineId: 'miner_4' },
      },
    });
    store.setResourceChecked('originium_ore', true);
    store.updateResourceRecipeField('originium_ore', 'machineId', 'miner_3');
    const edited = store.snapshot();
    expect(store.snapshot().resourceRecipeSettings.originium_ore).toEqual({
      machineId: 'miner_3',
      overclock: rational(150),
    });
    expect(store.snapshot().resourceLimits.rates.originium_ore).toEqual(
      rational(560, 60),
    );
    store.resetResourceRecipe('originium_ore');
    expect(store.snapshot().resourceRecipeSettings).toEqual({
      copper_ore: { machineId: 'miner_4' },
    });
    expect(
      store.snapshot().checkedDerived.has(resourceOwner('originium_ore')),
    ).toBeTrue();
    store.resetResourceRecipes();
    expect(store.snapshot().resourceRecipeSettings).toEqual({});
    expect(store.snapshot().resourceLimits.rates.originium_ore).toEqual(
      rational(560, 60),
    );
    expect(edited.resourceRecipeSettings.originium_ore).toEqual({
      machineId: 'miner_3',
      overclock: rational(150),
    });
    expect(edited.resourceRecipeSettings.copper_ore).toEqual({
      machineId: 'miner_4',
    });
    expect(
      edited.checkedDerived.has(resourceOwner('originium_ore')),
    ).toBeTrue();
  });

  it('removes value-equivalent defaults and keeps earlier snapshots unchanged', () => {
    const store = TestBed.inject(EndfieldStore);
    const before = store.snapshot();
    store.updateResourceRecipeField('iron_ore', 'overclock', rational(3, 2));
    const changed = store.snapshot();
    store.updateResourceRecipeField(
      'iron_ore',
      'overclock',
      rational(6, 4),
      rational(3, 2),
    );
    expect(store.snapshot().resourceRecipeSettings.iron_ore).toBeUndefined();
    expect(changed.resourceRecipeSettings.iron_ore?.overclock).toEqual(
      rational(3, 2),
    );
    expect(before.resourceRecipeSettings).toEqual({});

    store.updateResourceRecipeField('iron_ore', 'machineId', 'miner_3');
    store.updateResourceRecipeField(
      'iron_ore',
      'machineId',
      'miner_3',
      'miner_3',
    );
    expect(store.snapshot().resourceRecipeSettings.iron_ore).toBeUndefined();
  });

  it('rejects unknown resources and unsupported fields without mutating state', () => {
    const store = TestBed.inject(EndfieldStore);
    const before = store.snapshot();
    expect(() => {
      store.updateResourceRecipeField('unknown' as never, 'machineId', 'bad');
    }).toThrow();
    expect(() => {
      store.updateResourceRecipeField(
        'iron_ore',
        'cost' as never,
        rational.one as never,
      );
    }).toThrow();
    expect(() => {
      store.resetResourceRecipe('unknown' as never);
    }).toThrow();
    expect(() => {
      store.setResourceChecked('unknown' as never, true);
    }).toThrow();
    expect(() => {
      store.set({ ...before, checkedDerived: new Set(['ordinary:1']) });
    }).toThrow();
    expect(store.snapshot()).toBe(before);
    store.setResourceChecked('iron_ore', true);
    store.setResourceChecked('copper_ore', true);
    store.setResourceChecked('iron_ore', false);
    expect(
      store.snapshot().checkedDerived.has(resourceOwner('iron_ore')),
    ).toBeFalse();
    expect(
      store.snapshot().checkedDerived.has(resourceOwner('copper_ore')),
    ).toBeTrue();
    store.clearResourceChecked();
    expect(store.snapshot().checkedDerived.size).toBe(0);
  });
});
