import { TestBed } from '@angular/core/testing';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { EnergyType } from '~/data/schema/energy-type';
import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
import { createEndfieldState, EndfieldState } from '~/endfield/domain/model';
import { provideEndfield } from '~/endfield/providers';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import {
  WorkspaceRestoreError,
  WorkspaceState,
} from '~/extensions/state-extension';
import { rational } from '~/rational/rational';
import { ItemsStore } from '~/state/items/items-store';
import { MachinesStore } from '~/state/machines/machines-store';
import { ObjectiveState } from '~/state/objectives/objective';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { Migration } from '~/state/router/migration';
import { RouterSync } from '~/state/router/router-sync';
import { DisplayRate } from '~/state/settings/display-rate';
import { SettingsStore } from '~/state/settings/settings-store';
import { TableStore } from '~/state/table/table-store';
import { TestModule } from '~/tests/test-module';

import { decodeEndfield, encodeEndfield } from './codec';
import { validateCurrentWorkspace } from './restore';

const data = rawData as unknown as ModData;
const hash = rawHash as unknown as ModHash;
// Fixed aef has no fuels, modules, beacons, wagons or technologies. This
// extension supplies those entities to exercise the shared restore contract.
const supportedData: ModData = {
  ...data,
  items: [
    ...data.items.map((item) =>
      item.id === 'miner_4'
        ? {
            ...item,
            machine: {
              ...item.machine,
              type: EnergyType.Burner,
              fuelTypes: ['test-type'],
              modules: 2,
            },
          }
        : item,
    ),
    { id: 'test-fuel', name: 'Fuel', fuel: { types: ['test-type'], value: 1 } },
    { id: 'test-module', name: 'Module', module: { speed: 1 } },
    {
      id: 'test-beacon',
      name: 'Beacon',
      beacon: { effectivity: 1, modules: 2 },
    },
    {
      id: 'test-wagon',
      name: 'Wagon',
      wagon: { itemTypes: ['item'], capacity: 10 },
    },
    { id: 'test-technology', name: 'Technology', technology: {} },
  ],
};

function expectDiagnostic(
  action: () => unknown,
  field: string,
  code = 'invalid-endfield-state',
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(WorkspaceRestoreError);
  if (thrown instanceof WorkspaceRestoreError)
    expect(thrown.diagnostics).toEqual([
      jasmine.objectContaining({ field, code, severity: 'error' }),
    ]);
}
function objective(
  id: string,
  targetId: string,
  type: number,
  value: number,
  unit: ObjectiveUnit,
  settings = {},
): ObjectiveState {
  return {
    id,
    targetId,
    type,
    value: rational(value),
    unit,
    ...settings,
  };
}
function decode(
  state: WorkspaceState,
  params: Record<string, string> = { v: '12' },
): { state: WorkspaceState; extension: EndfieldState } {
  validateCurrentWorkspace(state, data);
  return { state, extension: decodeEndfield(params['ef'], data) };
}

describe('Endfield workspace restoration', () => {
  it('rejects negative ordinary machine quantities while retaining zero, positive values and signed costs', () => {
    for (const type of [0, 1, 2, 3]) {
      const entry = objective(
        '1',
        'originium_ore',
        type,
        -1,
        ObjectiveUnit.Machines,
      );
      const state = { objectivesState: { 1: entry } };
      expectDiagnostic(() => decode(state, { v: '12' }), 'objectives.1.value');
      expect(state.objectivesState[1]).toBe(entry);
      expect(entry.value).toEqual(rational(-1));
    }
    for (const value of [0, 2]) {
      const entry = objective(
        '1',
        'originium_ore',
        0,
        value,
        ObjectiveUnit.Machines,
        {
          cost: rational(-3),
        },
      );
      const result = decode(
        {
          objectivesState: { 1: entry },
          settingsState: { costs: { machine: rational(-2) } },
        },
        { v: '12' },
      );
      expect(result.state.objectivesState?.['1'].value).toEqual(
        rational(value),
      );
      expect(result.state.objectivesState?.['1'].cost).toEqual(rational(-3));
      expect(result.state.settingsState?.costs?.machine).toEqual(rational(-2));
    }
  });

  it('validates detached enum and table values, including custom preset IDs', () => {
    const invalidCases: [WorkspaceState, string][] = [
      ...[-1, 4, 999, 1.5, NaN, Infinity].map(
        (value): [WorkspaceState, string] => [
          { settingsState: { displayRate: value } },
          'settings.displayRate',
        ],
      ),
      ...[-1, 2, 999, 0.5, NaN, Infinity].map(
        (value): [WorkspaceState, string] => [
          { settingsState: { maximizeType: value } },
          'settings.maximizeType',
        ],
      ),
      ...[-1, 1, 999, 0.5, NaN, Infinity].map(
        (value): [WorkspaceState, string] => [
          { settingsState: { preset: value } },
          'settings.preset',
        ],
      ),
      ...[-1, 0.5, NaN, Infinity].map((page): [WorkspaceState, string] => [
        { tableState: { page } },
        'table.page',
      ]),
      ...[-1, 0, 0.5, NaN, Infinity].map((rows): [WorkspaceState, string] => [
        { tableState: { rows } },
        'table.rows',
      ]),
    ];
    for (const [state, field] of invalidCases) {
      expectDiagnostic(() => {
        validateCurrentWorkspace(state, data);
      }, field);
      expectDiagnostic(() => decode(state, { v: '12' }), field);
    }
    for (const displayRate of [0, 1, 2, 3])
      for (const maximizeType of [0, 1]) {
        const state: WorkspaceState = {
          settingsState: { displayRate, maximizeType, preset: 0 },
          tableState: { page: 0, rows: 37 },
        };
        expect(decode(state, { v: '12' }).state.tableState).toEqual(
          state.tableState,
        );
      }

    const customData: ModData = {
      ...data,
      defaults: { presets: [{ id: 7, label: 'custom' }] },
    };
    const state: WorkspaceState = { settingsState: { preset: 7 } };
    expect(() => {
      validateCurrentWorkspace(state, customData);
    }).not.toThrow();
    const withoutCustomPresets: ModData = { ...data, defaults: undefined };
    expect(() => {
      validateCurrentWorkspace(
        { settingsState: { preset: 1 } },
        withoutCustomPresets,
      );
    }).not.toThrow();
  });

  it('rejects non-Rational values at the public detached workspace boundary without modifying the input', () => {
    for (const value of ['1', 1, { p: 1n, q: 1n }]) {
      const entry = {
        ...objective('1', 'originium_ore', 0, 1, ObjectiveUnit.Items),
        value,
      } as unknown as ObjectiveState;
      const input = { objectivesState: { 1: entry } };
      expectDiagnostic(() => decode(input, { v: '12' }), 'objectives.1.value');
      expect(input.objectivesState[1]).toBe(entry);
      expect(entry.value as unknown).toBe(value);
    }
  });

  it('validates ordinary setting IDs before commit and retains valid state', () => {
    const state: WorkspaceState = {
      itemsState: { copper_ore: { beltId: 'belt', wagonId: 'test-wagon' } },
      recipesState: {
        'copper_ore-liquid_water': {
          machineId: 'miner_4',
          fuelId: 'test-fuel',
          modules: [{ id: 'test-module', count: rational.one }],
          beacons: [{ id: 'test-beacon', modules: [{ id: 'test-module' }] }],
        },
      },
      machinesState: {
        miner_4: {
          fuelId: 'test-fuel',
          modules: [{ id: 'test-module' }],
          beacons: [{ id: 'test-beacon' }],
        },
      },
      settingsState: {
        checkedItemIds: new Set(['copper_ore']),
        excludedItemIds: new Set(['iron_ore']),
        checkedRecipeIds: new Set(['originium_ore']),
        excludedRecipeIds: new Set(['sewage-treat']),
        beltRankIds: ['belt'],
        wagonRankIds: ['test-wagon'],
        machineRankIds: ['miner_4'],
        fuelRankIds: ['test-fuel'],
        moduleRankIds: ['test-module'],
        locationIds: new Set(['tundra']),
        researchedTechnologyIds: new Set(['test-technology']),
        proliferatorSprayId: 'test-module',
        beacons: [{ id: 'test-beacon', modules: [{ id: 'test-module' }] }],
        overclock: rational(100),
      },
    };
    expect(() => {
      validateCurrentWorkspace(state, supportedData);
    }).not.toThrow();
    expect(state.settingsState?.costs).toBeUndefined();
    expect(
      state.recipesState?.['copper_ore-liquid_water'].modules?.[0].id,
    ).toBe('test-module');
  });

  it('reports the field of invalid ordinary and global setting references', () => {
    const cases: [WorkspaceState, string][] = [
      [
        { itemsState: { copper_ore: { beltId: 'missing' } } },
        'items.copper_ore.beltId',
      ],
      [
        { itemsState: { copper_ore: { wagonId: 'missing' } } },
        'items.copper_ore.wagonId',
      ],
      [
        { recipesState: { originium_ore: { machineId: 'miner_4' } } },
        'recipes.originium_ore.machineId',
      ],
      [
        { recipesState: { originium_ore: { fuelId: 'missing' } } },
        'recipes.originium_ore.fuelId',
      ],
      [
        { machinesState: { miner_4: { modules: [{ id: 'missing' }] } } },
        'machines.miner_4.modules.0.id',
      ],
      [
        {
          machinesState: {
            miner_4: {
              beacons: [{ id: 'test-beacon', modules: [{ id: 'missing' }] }],
            },
          },
        },
        'machines.miner_4.beacons.0.modules.0.id',
      ],
      [
        { settingsState: { excludedItemIds: new Set(['missing']) } },
        'settings.excludedItemIds',
      ],
      [
        { settingsState: { checkedRecipeIds: new Set(['missing']) } },
        'settings.checkedRecipeIds',
      ],
      [
        { settingsState: { excludedRecipeIds: new Set(['missing']) } },
        'settings.excludedRecipeIds',
      ],
      [{ settingsState: { beltRankIds: ['missing'] } }, 'settings.beltRankIds'],
      [
        { settingsState: { wagonRankIds: ['missing'] } },
        'settings.wagonRankIds',
      ],
      [
        { settingsState: { machineRankIds: ['missing'] } },
        'settings.machineRankIds',
      ],
      [{ settingsState: { fuelRankIds: ['missing'] } }, 'settings.fuelRankIds'],
      [
        { settingsState: { moduleRankIds: ['missing'] } },
        'settings.moduleRankIds',
      ],
      [
        { settingsState: { locationIds: new Set(['missing']) } },
        'settings.locationIds',
      ],
      [
        { settingsState: { researchedTechnologyIds: new Set(['missing']) } },
        'settings.researchedTechnologyIds',
      ],
      [
        { settingsState: { proliferatorSprayId: 'missing' } },
        'settings.proliferatorSprayId',
      ],
      [
        { settingsState: { beacons: [{ id: 'missing' }] } },
        'settings.beacons.0.id',
      ],
      [{ settingsState: { overclock: rational.zero } }, 'settings.overclock'],
      [
        { machinesState: { miner_4: { overclock: rational(-1) } } },
        'machines.miner_4.overclock',
      ],
      [
        { recipesState: { originium_ore: { overclock: rational.zero } } },
        'recipes.originium_ore.overclock',
      ],
    ];
    for (const [state, field] of cases)
      expectDiagnostic(() => {
        validateCurrentWorkspace(state, supportedData);
      }, field);
  });

  it('validates ordinary objective fields and ignores unsupported objective fields', () => {
    const invalid = objective('1', 'missing', 0, -1, ObjectiveUnit.Machines, {
      overclock: rational.zero,
    });
    expectDiagnostic(() => {
      validateCurrentWorkspace({ objectivesState: { 1: invalid } }, data);
    }, 'objectives.1.targetId');
    const invalidUnit = objective(
      '1',
      'originium_ore',
      0,
      1,
      999 as ObjectiveUnit,
    );
    expectDiagnostic(() => {
      validateCurrentWorkspace({ objectivesState: { 1: invalidUnit } }, data);
    }, 'objectives.1.unit');
    const unsupported = [11, 12, 13, 14, 999].map((type, index) =>
      objective(
        String(index + 1),
        'missing',
        type,
        -1,
        ObjectiveUnit.Machines,
        { overclock: rational.zero },
      ),
    );
    const state: WorkspaceState = {
      objectivesState: Object.fromEntries(
        unsupported.map((entry) => [entry.id, entry]),
      ),
      settingsState: {
        checkedObjectiveIds: new Set(['2', '4']),
        costs: { recycling: rational.zero },
      },
    };
    expect(() => {
      validateCurrentWorkspace(state, data);
    }).not.toThrow();
    expect(state.settingsState?.checkedObjectiveIds).toEqual(
      new Set(['2', '4']),
    );
    expect(state.settingsState?.costs?.recycling).toEqual(rational.zero);
  });

  it('rejects zero ordinary recipe speed and unknown producers', () => {
    for (const settings of [
      { overclock: rational.zero },
      { machineId: 'miner_4' },
    ]) {
      const entry = objective(
        '1',
        'originium_ore',
        0,
        1,
        ObjectiveUnit.Machines,
        settings,
      );
      expect(() => {
        validateCurrentWorkspace({ objectivesState: { 1: entry } }, data);
      }).toThrowError(WorkspaceRestoreError);
    }
  });
});

describe('Endfield router validation', () => {
  let router: RouterSync;
  let settings: SettingsStore;
  let objectives: ObjectivesStore;
  let items: ItemsStore;
  let recipes: RecipesStore;
  let machines: MachinesStore;
  let table: TableStore;
  let endfield: EndfieldStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        ...provideEndfield(),
        { provide: SettingsStore, useClass: SettingsStore },
      ],
    });
    settings = TestBed.inject(SettingsStore);
    settings.apply({ modId: 'aef', displayRate: DisplayRate.PerHour });
    settings['modDataResource'].set(data);
    settings['modHashResource'].set(hash);
    router = TestBed.inject(RouterSync);
    objectives = TestBed.inject(ObjectivesStore);
    items = TestBed.inject(ItemsStore);
    recipes = TestBed.inject(RecipesStore);
    machines = TestBed.inject(MachinesStore);
    table = TestBed.inject(TableStore);
    endfield = TestBed.inject(EndfieldStore);
  });

  function restore(query: string): void {
    const params = router.toParams(query);
    const migrated = TestBed.inject(Migration).migrate('aef', params);
    router.updateState(
      migrated.modId,
      migrated.params,
      migrated.isBare,
      data,
      hash,
    );
  }

  it('reads ef exactly once and does not read cet', () => {
    let reads = 0;
    const encoded = encodeEndfield({
      ...createEndfieldState(),
      electric: rational(3),
    });
    const params = Object.defineProperties(
      { v: '12' },
      {
        ef: {
          get: () => {
            reads++;
            return encoded;
          },
        },
        cet: {
          get: () => {
            throw new Error('cet must not be read');
          },
        },
      },
    );
    router.updateState('aef', params, true, data, hash);
    expect(reads).toBe(1);
    expect(endfield.state().electric).toEqual(rational(3));
  });

  it('rejects invalid wire values without publishing any part of the candidate', () => {
    objectives.set({
      1: objective('1', 'originium_ore', 0, 3, ObjectiveUnit.Machines),
    });
    items.set({ iron_ore: { beltId: 'belt' } });
    recipes.set({ 'sewage-treat': { cost: rational(-4) } });
    machines.set({ miner_4: { overclock: rational(125) } });
    table.set({ asc: true, page: 2, rows: 25, filter: 'retained' });
    endfield.set({ ...createEndfieldState(), electric: rational(8) });
    const before = {
      objectives: objectives.state(),
      items: items.state(),
      recipes: recipes.state(),
      machines: machines.state(),
      settings: settings.state(),
      table: table.state(),
      extension: endfield.state(),
    };
    const dispatch = spyOn(router, 'dispatch').and.callThrough();
    const commit = spyOn(endfield, 'set').and.callThrough();
    for (const input of [
      'o=sewage-treat*-1*3*0',
      'odr=999',
      'odr=Infinity',
      'omt=999',
      'mpr=1',
      'tpg=-1',
      'tpg=1.5',
      'tro=0',
      'tro=-1',
      'tro=1.5',
    ]) {
      expect(() => {
        restore(`v=12&${input}`);
      })
        .withContext(input)
        .toThrowError(WorkspaceRestoreError);
      expect(objectives.state()).toBe(before.objectives);
      expect(items.state()).toBe(before.items);
      expect(recipes.state()).toBe(before.recipes);
      expect(machines.state()).toBe(before.machines);
      expect(settings.state()).toBe(before.settings);
      expect(table.state()).toBe(before.table);
      expect(endfield.state()).toBe(before.extension);
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(objectives.state()['1'].value).toEqual(rational(3));
    expect(endfield.state().electric).toEqual(rational(8));
  });

  it('rolls back previously loaded stores if a later store load fails', () => {
    objectives.set({
      1: objective('1', 'originium_ore', 0, 3, ObjectiveUnit.Machines),
    });
    settings.apply({
      costs: { ...settings.state().costs, machine: rational(-2) },
    });
    endfield.set({ ...createEndfieldState(), electric: rational(8) });
    const previous = {
      objectives: objectives.state(),
      items: items.state(),
      recipes: recipes.state(),
      machines: machines.state(),
      settings: settings.state(),
      table: table.state(),
      endfield: encodeEndfield(endfield.snapshot()),
    };
    spyOn(table, 'load').and.throwError('table load failed');
    expect(() => {
      restore('v=12&o=xiranite_powder*2&cma=0');
    }).toThrowError('table load failed');
    expect(objectives.state()).toBe(previous.objectives);
    expect(items.state()).toBe(previous.items);
    expect(recipes.state()).toBe(previous.recipes);
    expect(machines.state()).toBe(previous.machines);
    expect(settings.state()).toBe(previous.settings);
    expect(table.state()).toBe(previous.table);
    expect(encodeEndfield(endfield.snapshot())).toBe(previous.endfield);
  });

  it('reports both a commit failure and a subsequent rollback failure', () => {
    spyOn(table, 'load').and.throwError('table load failed');
    const originalSet = items.set.bind(items);
    let calls = 0;
    spyOn(items, 'set').and.callFake((state) => {
      if (++calls === 2) throw new Error('items rollback failed');
      originalSet(state);
    });
    let error: unknown;
    try {
      restore('v=12&o=xiranite_powder*2');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AggregateError);
    if (error instanceof AggregateError)
      expect(error.errors.map((cause: Error) => cause.message)).toEqual([
        'table load failed',
        'items rollback failed',
      ]);
  });

  it('publishes valid enum and page values, machine quantities and signed costs', () => {
    for (const [displayRate, maximizeType, page, rows, value] of [
      [0, 0, 0, 1, 0],
      [1, 1, 1, 10, 1],
      [2, 0, 2, 25, 2],
      [3, 1, 3, 37, 3],
    ]) {
      restore(
        `v=12&odr=${displayRate}&omt=${maximizeType}&mpr=0&tpg=${page}&tro=${rows}&cma=-2&o=sewage-treat*${value}*3*0`,
      );
      expect(settings.state().displayRate).toBe(displayRate);
      expect(settings.state().maximizeType).toBe(maximizeType);
      expect(settings.state().preset).toBe(0);
      expect(settings.state().costs.machine).toEqual(rational(-2));
      expect(table.state().page).toBe(page);
      expect(table.state().rows).toBe(rows);
      expect(objectives.state()['1'].value).toEqual(rational(value));
    }
  });
});
