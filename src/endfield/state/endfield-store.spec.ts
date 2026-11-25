import { TestBed } from '@angular/core/testing';

import { createEndfieldState, ovenId } from '~/endfield/domain/model';
import { rational } from '~/rational/rational';

import { EndfieldStore } from './endfield-store';

describe('EndfieldStore', () => {
  it('loads an older enabled workspace with the default Tundra source', () => {
    const store = TestBed.inject(EndfieldStore);
    store.load({ transferEnabled: true });
    expect(store.state().transferEnabled).toBeTrue();
    expect(store.state().transferSource).toBe('tundra');
  });
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
      transferEnabled: true,
      checkedDerived: new Set(['copper_ore']),
      resourceRecipeSettings: {
        copper_ore: { machineId: 'miner_4', overclock: rational(125) },
      },
      electric: rational(2),
    });
    const snapshot = store.state();
    store.setResourceChecked('copper_ore', false);
    store.updateResourceRecipeField('copper_ore', 'machineId', 'miner_2');
    const edited = store.state();
    expect(edited.checkedDerived.has('copper_ore')).toBeFalse();
    expect(edited.resourceRecipeSettings.copper_ore).toEqual({
      machineId: 'miner_2',
      overclock: rational(125),
    });
    expect(snapshot.checkedDerived.has('copper_ore')).toBeTrue();
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
    expect(snapshot.transferEnabled).toBeTrue();
    expect(snapshot.electric).toEqual(rational(2));

    store.load(undefined);
    expect(store.state()).toEqual(createEndfieldState());
    expect(edited.resourceRecipeSettings.copper_ore?.machineId).toBe('miner_2');
    expect(snapshot.checkedDerived.has('copper_ore')).toBeTrue();
    store.set(snapshot);
    expect(store.state()).toEqual(snapshot);
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
    const edited = store.state();
    expect(store.state().resourceRecipeSettings.originium_ore).toEqual({
      machineId: 'miner_3',
      overclock: rational(150),
    });
    expect(store.state().resourceLimits.rates.originium_ore).toEqual(
      rational(560, 60),
    );
    store.resetResourceRecipe('originium_ore');
    expect(store.state().resourceRecipeSettings).toEqual({
      copper_ore: { machineId: 'miner_4' },
    });
    expect(store.state().checkedDerived.has('originium_ore')).toBeTrue();
    store.resetResourceRecipes();
    expect(store.state().resourceRecipeSettings).toEqual({});
    expect(store.state().resourceLimits.rates.originium_ore).toEqual(
      rational(560, 60),
    );
    expect(edited.resourceRecipeSettings.originium_ore).toEqual({
      machineId: 'miner_3',
      overclock: rational(150),
    });
    expect(edited.resourceRecipeSettings.copper_ore).toEqual({
      machineId: 'miner_4',
    });
    expect(edited.checkedDerived.has('originium_ore')).toBeTrue();
  });

  it('removes value-equivalent defaults and keeps earlier snapshots unchanged', () => {
    const store = TestBed.inject(EndfieldStore);
    const before = store.state();
    store.updateResourceRecipeField('iron_ore', 'overclock', rational(3, 2));
    const changed = store.state();
    store.updateResourceRecipeField(
      'iron_ore',
      'overclock',
      rational(6, 4),
      rational(3, 2),
    );
    expect(store.state().resourceRecipeSettings.iron_ore).toBeUndefined();
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
    expect(store.state().resourceRecipeSettings.iron_ore).toBeUndefined();
  });

  it('checks and clears independent resource rows', () => {
    const store = TestBed.inject(EndfieldStore);
    store.setResourceChecked('iron_ore', true);
    store.setResourceChecked('copper_ore', true);
    store.setResourceChecked('iron_ore', false);
    expect(store.state().checkedDerived.has('iron_ore')).toBeFalse();
    expect(store.state().checkedDerived.has('copper_ore')).toBeTrue();
    store.clearResourceChecked();
    expect(store.state().checkedDerived.size).toBe(0);
  });
});
