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

  it('owns every input container and projects resource settings to supported fields', () => {
    const store = TestBed.inject(EndfieldStore);
    const initial = createEndfieldState();
    const owners = new Set([resourceOwner('copper_ore')]);
    const source = {
      machineId: 'miner_4',
      overclock: rational(125),
      cost: rational(-1),
    };
    const rates = { ...initial.resourceLimits.rates, copper_ore: rational(5) };
    const limits = { [ovenId]: rational(7) };
    const resourceLimits = { enabled: true, rates };
    const machineLimits = { enabled: true, limits };
    const transfer = { enabled: true, source: 'tundra' as const };
    const sourceSettings = { copper_ore: source };
    const input = {
      ...initial,
      resourceLimits,
      machineLimits,
      transfer,
      checkedDerived: owners,
      resourceRecipeSettings: sourceSettings,
      electric: rational(2),
    };
    store.set(input);

    owners.clear();
    source.machineId = 'other';
    source.overclock = rational(200);
    sourceSettings.copper_ore = { ...source, machineId: 'replacement' };
    rates.copper_ore = rational(50);
    limits[ovenId] = rational(70);
    resourceLimits.enabled = false;
    machineLimits.enabled = false;
    transfer.enabled = false;
    input.electric = rational(3);

    const snapshot = store.snapshot();
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
    store.set(snapshot);
    store.setResourceChecked('copper_ore', false);
    store.updateResourceRecipeField('copper_ore', 'machineId', 'miner_2');
    expect(snapshot.checkedDerived.has(resourceOwner('copper_ore'))).toBeTrue();
    expect(snapshot.resourceRecipeSettings.copper_ore?.machineId).toBe(
      'miner_4',
    );
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

  it('omits empty optional entries when accepting a snapshot', () => {
    const store = TestBed.inject(EndfieldStore);
    store.set({
      ...createEndfieldState(),
      resourceRecipeSettings: { iron_ore: undefined, copper_ore: {} },
    });
    expect(store.snapshot().resourceRecipeSettings).toEqual({});
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
