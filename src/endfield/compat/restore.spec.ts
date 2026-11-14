import { TestBed } from '@angular/core/testing';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { EnergyType } from '~/data/schema/energy-type';
import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
import { createEndfieldState } from '~/endfield/domain/model';
import { provideEndfield } from '~/endfield/providers';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { rational } from '~/rational/rational';
import { ItemsStore } from '~/state/items/items-store';
import { MachinesStore } from '~/state/machines/machines-store';
import { ObjectiveState } from '~/state/objectives/objective';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { Migration } from '~/state/router/migration';
import { type PartialState, RouterSync } from '~/state/router/router-sync';
import { DisplayRate } from '~/state/settings/display-rate';
import { SettingsStore } from '~/state/settings/settings-store';
import { TableStore } from '~/state/table/table-store';
import { TestModule } from '~/tests/test-module';

import { encodeEndfield } from './codec';
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

function expectRestoreError(action: () => unknown, context: string): void {
  expect(action).withContext(context).toThrowError(Error);
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
      expect(() => {
        validateCurrentWorkspace(state, data);
      }).toThrowError(
        Error,
        'Expected a nonnegative rational at objectives.1.value',
      );
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
      const state: PartialState = {
        objectivesState: { 1: entry },
        settingsState: { costs: { machine: rational(-2) } },
      };
      expect(() => {
        validateCurrentWorkspace(state, data);
      }).not.toThrow();
      expect(state.objectivesState?.['1'].value).toEqual(rational(value));
      expect(state.objectivesState?.['1'].cost).toEqual(rational(-3));
      expect(state.settingsState?.costs?.machine).toEqual(rational(-2));
    }
  });

  it('validates detached enum and table values, including custom preset IDs', () => {
    const invalidCases: [PartialState, string][] = [
      ...[-1, 4, 999, 1.5, NaN, Infinity].map(
        (value): [PartialState, string] => [
          { settingsState: { displayRate: value } },
          'Unknown display rate',
        ],
      ),
      ...[-1, 2, 999, 0.5, NaN, Infinity].map(
        (value): [PartialState, string] => [
          { settingsState: { maximizeType: value } },
          'Unknown maximize type',
        ],
      ),
      ...[-1, 1, 999, 0.5, NaN, Infinity].map(
        (value): [PartialState, string] => [
          { settingsState: { preset: value } },
          'Unknown preset',
        ],
      ),
      ...[-1, 0.5, NaN, Infinity].map((page): [PartialState, string] => [
        { tableState: { page } },
        'Expected a nonnegative integer page',
      ]),
      ...[-1, 0, 0.5, NaN, Infinity].map((rows): [PartialState, string] => [
        { tableState: { rows } },
        'Expected a positive integer row count',
      ]),
    ];
    for (const [state, message] of invalidCases) {
      expect(() => {
        validateCurrentWorkspace(state, data);
      }).toThrowError(Error, message);
    }
    for (const displayRate of [0, 1, 2, 3])
      for (const maximizeType of [0, 1]) {
        const state: PartialState = {
          settingsState: { displayRate, maximizeType, preset: 0 },
          tableState: { page: 0, rows: 37 },
        };
        expect(() => {
          validateCurrentWorkspace(state, data);
        }).not.toThrow();
      }

    const customData: ModData = {
      ...data,
      defaults: { presets: [{ id: 7, label: 'custom' }] },
    };
    const state: PartialState = { settingsState: { preset: 7 } };
    expect(() => {
      validateCurrentWorkspace(state, customData);
    }).not.toThrow();
  });

  it('validates ordinary setting IDs before commit and retains valid state', () => {
    const state: PartialState = {
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
    const cases: [PartialState, string][] = [
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
      expectRestoreError(() => {
        validateCurrentWorkspace(state, supportedData);
      }, field);
  });

  it('validates ordinary objective fields and ignores unsupported objective fields', () => {
    const invalid = objective('1', 'missing', 0, -1, ObjectiveUnit.Machines, {
      overclock: rational.zero,
    });
    expectRestoreError(() => {
      validateCurrentWorkspace({ objectivesState: { 1: invalid } }, data);
    }, 'objectives.1.targetId');
    const invalidUnit = objective(
      '1',
      'originium_ore',
      0,
      1,
      999 as ObjectiveUnit,
    );
    expectRestoreError(() => {
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
    const state: PartialState = {
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
      }).toThrowError(Error);
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
    const encoded = encodeEndfield(createEndfieldState());
    for (const input of [
      'o=sewage-treat*-1*3*0',
      `ef=${encoded}&ef=${encoded}`,
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
        .toThrowError(Error);
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
