import { TestBed } from '@angular/core/testing';

import { createEndfieldState, resourceOwner } from '~/endfield/domain/model';
import { mutableValue } from '~/extensions/immutable';
import {
  EFFECTIVE_DEFAULTS,
  upstreamProduct,
} from '~/extensions/product-profile';
import { rational } from '~/rational/rational';

import { EndfieldStore } from './endfield-store';

describe('EndfieldStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EndfieldStore,
        {
          provide: EFFECTIVE_DEFAULTS,
          useValue: {
            ...upstreamProduct.defaults(),
            extension: createEndfieldState(),
          },
        },
      ],
    });
  });

  it('owns immutable snapshots and resets from effective defaults', () => {
    const store = TestBed.inject(EndfieldStore);
    const input = createEndfieldState();
    const owners = new Set([resourceOwner('copper_ore')]);
    store.set({
      ...input,
      checkedDerived: owners,
      resourceRecipeSettings: {
        copper_ore: {
          machineId: 'miner_4',
          modules: [{ count: rational.one }],
        },
      },
    });
    owners.clear();
    expect(
      store.snapshot().checkedDerived.has(resourceOwner('copper_ore')),
    ).toBeTrue();
    expect(Reflect.get(store.snapshot().checkedDerived, 'add')).toBeUndefined();
    expect(() =>
      Object.assign(store.snapshot().resourceRecipeSettings.copper_ore ?? {}, {
        machineId: 'other',
      }),
    ).toThrow();
    store.reset();
    expect(mutableValue(store.snapshot())).toEqual(createEndfieldState());
  });

  it('clears dependent machine fields and resets only the requested resource', () => {
    const store = TestBed.inject(EndfieldStore);
    store.set({
      ...createEndfieldState(),
      resourceLimits: {
        ...createEndfieldState().resourceLimits,
        enabled: true,
      },
      resourceRecipeSettings: {
        originium_ore: {
          machineId: 'miner_2',
          fuelId: 'fuel',
          modules: [{ id: 'module' }],
          beacons: [{ id: 'beacon' }],
          overclock: rational(150),
        },
        copper_ore: { machineId: 'miner_4' },
      },
    });
    store.updateRecipeField('originium_ore', 'machineId', 'miner_3');
    expect(store.snapshot().resourceRecipeSettings.originium_ore).toEqual({
      machineId: 'miner_3',
      overclock: rational(150),
    });
    store.resetRecipe('originium_ore');
    expect(store.snapshot().resourceRecipeSettings).toEqual({
      copper_ore: { machineId: 'miner_4' },
    });
    expect(store.snapshot().resourceLimits.enabled).toBeTrue();
  });

  it('only accepts resource owners for derived checks', () => {
    const store = TestBed.inject(EndfieldStore);
    store.toggleDerived(resourceOwner('iron_ore'), true);
    expect(
      store.snapshot().checkedDerived.has(resourceOwner('iron_ore')),
    ).toBeTrue();
    expect(() => {
      store.toggleDerived('ef:resource:iron_ore', true);
    }).toThrow();
    expect(() => {
      store.set({
        ...store.snapshot(),
        checkedDerived: new Set(['ordinary:1']),
      });
    }).toThrow();
    store.clearDerived();
    expect(store.snapshot().checkedDerived.size).toBe(0);
  });
  it('removes value-equivalent defaults without mutating prior snapshots', () => {
    const store = TestBed.inject(EndfieldStore);
    const before = store.snapshot();
    store.updateRecipeField('iron_ore', 'overclock', rational(3, 2));
    const changed = store.snapshot();
    store.updateRecipeField(
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
    const modules = [{ id: 'speed' }];
    store.updateRecipeField('iron_ore', 'modules', modules, modules);
    expect(store.snapshot().resourceRecipeSettings.iron_ore).toBeUndefined();
    store.updateRecipeField('iron_ore', 'fuelId', 'fuel');
    store.updateRecipeField('iron_ore', 'fuelId', 'fuel', 'fuel');
    expect(store.snapshot().resourceRecipeSettings.iron_ore).toBeUndefined();
  });

  it('rejects unknown ids without changing state and supports removing a derived check', () => {
    const store = TestBed.inject(EndfieldStore);
    const before = store.snapshot();
    expect(() => {
      store.updateRecipeField('unknown' as never, 'machineId', 'bad');
    }).toThrow();
    expect(() => {
      store.resetRecipe('unknown' as never);
    }).toThrow();
    expect(store.snapshot()).toBe(before);
    const owner = resourceOwner('iron_ore');
    store.toggleDerived(owner, true);
    store.toggleDerived(owner, false);
    expect(store.snapshot().checkedDerived.has(owner)).toBeFalse();
  });
});
