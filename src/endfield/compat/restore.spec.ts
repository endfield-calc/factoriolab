import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { EnergyType } from '~/data/schema/energy-type';
import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
import {
  createEndfieldState,
  EndfieldState,
  resourceOwner,
} from '~/endfield/domain/model';
import {
  StateExtension,
  WorkspaceRestoreError,
  WorkspaceState,
} from '~/extensions/state-extension';
import { rational } from '~/rational/rational';
import {
  ObjectiveSettings,
  ObjectiveState,
} from '~/state/objectives/objective';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { DisplayRate } from '~/state/settings/display-rate';

import { encodeEndfield } from './codec';
import legacyHash from './legacy-hash.json';
import {
  decodeWorkspace,
  preflightWorkspace,
  prepareEndfield,
} from './restore';

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
function prepared(
  id: string,
  item: string,
  output: ReturnType<typeof rational>,
): ObjectiveSettings {
  return {
    id,
    recipe: { output: { [item]: output } },
  } as unknown as ObjectiveSettings;
}
function decode(
  state: WorkspaceState,
  params: Record<string, string> = { v: '11' },
  preparedObjectives: Record<string, ObjectiveSettings> = {},
): ReturnType<StateExtension['decode']> {
  return decodeWorkspace({
    state,
    params,
    plan: prepareEndfield({ modId: 'aef', params }),
    data,
    hash,
    preparedObjectives,
  });
}

describe('Endfield workspace restoration', () => {
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

  it('preserves typed recipe fields on the detached legacy-supply API independently of wire serialization', () => {
    const source = objective(
      '1',
      'originium_ore',
      12,
      2,
      ObjectiveUnit.Machines,
      { cost: rational(-3), productivity: rational(7, 5) },
    );
    const restored = decode(
      { objectivesState: { 1: source } },
      { v: '11' },
      { 1: prepared('1', 'originium_ore', rational(1, 3)) },
    ).extension as EndfieldState;
    expect(
      restored.resourceRecipeSettings.originium_ore?.cost?.eq(rational(-3)),
    ).toBeTrue();
    expect(
      restored.resourceRecipeSettings.originium_ore?.productivity?.eq(
        rational(7, 5),
      ),
    ).toBeTrue();
    expect(
      restored.resourceLimits.rates.originium_ore.eq(rational(2, 3)),
    ).toBeTrue();
  });
  it('rejects zero-speed ordinary and legacy recipe settings before preparation', () => {
    for (const type of [0, 12]) {
      const state = {
        objectivesState: {
          1: objective('1', 'originium_ore', type, 1, ObjectiveUnit.Machines, {
            overclock: rational.zero,
          }),
        },
      };
      expect(() =>
        type === 12
          ? preflightWorkspace({
              state,
              plan: prepareEndfield({ modId: 'aef', params: { v: '11' } }),
              data,
            })
          : decode(state, { v: '12' }),
      ).toThrowError(WorkspaceRestoreError, /overclock must be positive/);
    }
  });
  it('selects frozen historic tables by original v even when ef exists', () => {
    const ef = encodeEndfield(createEndfieldState());
    const plan = prepareEndfield({ modId: 'aef', params: { v: '11', ef } });
    expect(plan.hash).toEqual(legacyHash);
    expect(plan.legacyModHashes?.modHash[16]).toBe('aef');
    expect(plan.legacyModHashes?.modHashV0[2]).toBe('aef');
    expect(Object.isFrozen(plan.hash?.recipes)).toBeTrue();
    expect(plan.prepareObjectives).toBeFalse();
    expect(
      prepareEndfield({ params: { v: '11' } }).prepareObjectives,
    ).toBeTrue();
    expect(prepareEndfield({ params: { v: '12' } }).hash).toBeUndefined();
    expect(Object.isFrozen(plan.legacyModHashes?.modHash)).toBeTrue();
    expect(Object.isFrozen(plan.legacyModHashes?.modHashV0)).toBeTrue();
    expect(prepareEndfield({ params: {} }).hash).toBeUndefined();
    expect(prepareEndfield({ params: { o: 'iron_ore' } }).hash).toEqual(
      legacyHash,
    );
    expectDiagnostic(
      () => prepareEndfield({ params: { v: ['11', '12'] } }),
      'v',
    );
  });

  it('validates ordinary setting IDs before preparing and retains valid state', () => {
    const plan = prepareEndfield({ params: { v: '11' } });
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
    expect(preflightWorkspace({ state, plan, data: supportedData })).toEqual(
      [],
    );
    const result = decodeWorkspace({
      state,
      params: { v: '11' },
      plan,
      data: supportedData,
      hash,
    });
    expect(result.state).toEqual({
      ...state,
      settingsState: {
        ...state.settingsState,
        costs: {
          unproduceable: rational(1000000),
          recycling: rational(1000),
        },
      },
    });
    expect(state.settingsState?.costs).toBeUndefined();
    expect(
      state.recipesState?.['copper_ore-liquid_water'].modules?.[0].id,
    ).toBe('test-module');
  });

  it('keeps a truly empty detached workspace sparse and fills historical costs without mutating input', () => {
    const input: WorkspaceState = {};
    const fresh = decode(input, {});
    expect(fresh.state).toEqual({});
    expect(Object.hasOwn(fresh.state, 'settingsState')).toBeFalse();
    const historical = decode(input, { v: '12' });
    expect(historical.state).toEqual({
      settingsState: {
        costs: {
          unproduceable: rational(1000000),
          recycling: rational(1000),
        },
      },
    });
    expect(input).toEqual({});

    const explicit: WorkspaceState = {
      settingsState: { costs: { recycling: rational.zero } },
    };
    expect(decode(explicit, { v: '12' }).state.settingsState?.costs).toEqual({
      unproduceable: rational(1000000),
      recycling: rational.zero,
    });
    expect(explicit.settingsState?.costs).toEqual({ recycling: rational.zero });
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
    const plan = prepareEndfield({ params: { v: '11' } });
    for (const [state, field] of cases)
      expectDiagnostic(
        () => preflightWorkspace({ state, plan, data: supportedData }),
        field,
      );
  });

  it('preflights preparation references and selects only legacy supply objectives', () => {
    const state: WorkspaceState = {
      objectivesState: {
        '1': objective('1', 'originium_ore', 11, 0, ObjectiveUnit.Machines),
        '2': objective(
          '2',
          'copper_ore-liquid_water',
          12,
          3,
          ObjectiveUnit.Machines,
          { machineId: 'miner_4' },
        ),
        '3': objective('3', 'originium_ore', 0, 1, ObjectiveUnit.Machines),
      },
    };
    const plan = prepareEndfield({ params: { v: '11' } });
    expect(preflightWorkspace({ state, plan, data })).toEqual(['2']);
    const invalidState: WorkspaceState = {
      ...state,
      objectivesState: {
        ...state.objectivesState,
        '2': objective(
          '2',
          'copper_ore-liquid_water',
          12,
          3,
          ObjectiveUnit.Machines,
          { machineId: 'missing' },
        ),
      },
    };
    expect(() =>
      preflightWorkspace({ state: invalidState, plan, data }),
    ).toThrowError(WorkspaceRestoreError);
    const efPlan = prepareEndfield({
      params: { v: '11', ef: encodeEndfield(createEndfieldState()) },
    });
    expect(
      preflightWorkspace({ state: invalidState, plan: efPlan, data }),
    ).toEqual([]);
    expect(() =>
      preflightWorkspace({
        state,
        plan: prepareEndfield({ params: { v: '11', ef: 'corrupt' } }),
        data,
      }),
    ).toThrowError(WorkspaceRestoreError);
    expect(() =>
      preflightWorkspace({
        state: { recipesState: { missing: { machineId: 'miner_4' } } },
        plan,
        data,
      }),
    ).toThrowError(WorkspaceRestoreError);
  });

  it('extracts legacy supply, machine and transfer with adjusted rates and preserves ordinary order and checks', () => {
    const state: WorkspaceState = {
      objectivesState: {
        '1': objective('1', 'originium_ore', 11, 0, ObjectiveUnit.Machines),
        '2': objective(
          '2',
          'copper_ore-liquid_water',
          12,
          28,
          ObjectiveUnit.Machines,
          { machineId: 'miner_4', overclock: rational(125) },
        ),
        '3': objective('3', 'xiranite_powder', 0, 4, ObjectiveUnit.Machines),
        '4': objective('4', 'originium_ore', 0, 86400, ObjectiveUnit.Items),
        '5': objective(
          '5',
          'copper_ore-liquid_water',
          12,
          6,
          ObjectiveUnit.Machines,
          { machineId: 'miner_4' },
        ),
        '6': objective('6', 'xiranite_oven_1', 13, 12, ObjectiveUnit.Items),
        '7': objective('7', 'xiranite_oven_1', 13, 9, ObjectiveUnit.Items),
        '8': objective('8', 'domain_key_tundra', 14, 1, ObjectiveUnit.Items),
        '9': objective('9', 'xiranite_powder', 1, 3, ObjectiveUnit.Items),
      },
      settingsState: {
        displayRate: 3 as DisplayRate,
        checkedObjectiveIds: new Set(['2', '3', '4', '9']),
        checkedItemIds: new Set(['copper_ore']),
      },
    };
    const output = decode(
      state,
      { v: '11', cet: '3/2' },
      {
        '2': prepared('2', 'copper_ore', rational(1, 3)),
        '5': prepared('5', 'copper_ore', rational(2, 3)),
      },
    );
    const extension = output.extension as EndfieldState;
    expect(extension.resourceLimits.enabled).toBeTrue();
    expect(extension.resourceLimits.rates.copper_ore).toEqual(rational(4));
    expect(extension.resourceRecipeSettings.copper_ore).toEqual({
      machineId: 'miner_4',
    });
    expect(extension.machineLimits.limits['xiranite_oven_1']).toEqual(
      rational(9),
    );
    expect(extension.transfer.enabled).toBeTrue();
    expect(extension.electric).toEqual(rational(3, 2));
    expect(
      extension.checkedDerived.has(resourceOwner('copper_ore')),
    ).toBeTrue();
    expect(output.diagnostics.map((d) => d.code)).toEqual([
      'duplicate-legacy-objective',
      'duplicate-legacy-objective',
    ]);
    expect(
      Object.values(output.state.objectivesState ?? {}).map((o) => [
        o.id,
        o.targetId,
        o.value.toString(),
        o.unit,
      ]),
    ).toEqual([
      ['1', 'xiranite_powder-carbon_enr', '4', ObjectiveUnit.Machines],
      ['2', 'originium_ore', '86400', ObjectiveUnit.Items],
      ['3', 'xiranite_powder', '3', ObjectiveUnit.Items],
    ]);
    expect(output.state.settingsState?.displayRate).toBe(3 as DisplayRate);
    expect(output.state.settingsState?.checkedObjectiveIds).toEqual(
      new Set(['1', '2', '3']),
    );
    expect(output.state.settingsState?.checkedItemIds).toEqual(
      new Set(['copper_ore']),
    );
  });

  it('preserves valid ef ahead of legacy fields and does not migrate their checked IDs', () => {
    const defaults = createEndfieldState();
    const saved = {
      ...defaults,
      electric: rational(5),
      checkedDerived: new Set([resourceOwner('iron_ore')]),
    };
    const out = decode(
      {
        objectivesState: {
          '1': objective(
            '1',
            'copper_ore-liquid_water',
            12,
            1,
            ObjectiveUnit.Machines,
          ),
          '2': objective('2', 'iron_ore', 0, 3, ObjectiveUnit.Items),
        },
        settingsState: { checkedObjectiveIds: new Set(['1', '2']) },
      },
      { v: '11', cet: '2', ef: encodeEndfield(saved) },
    );
    expect(out.extension).toEqual(saved);
    expect(out.state.settingsState?.checkedObjectiveIds).toEqual(
      new Set(['1']),
    );
    expect(out.diagnostics.map((d) => d.code)).toEqual([
      'ignored-legacy-extension',
    ]);
  });

  it('rejects invalid hidden goals with the original state and field intact', () => {
    const cases: [
      ObjectiveState,
      string,
      Record<string, ObjectiveSettings>?,
    ][] = [
      [
        objective('1', 'originium_ore', 11, 0, ObjectiveUnit.Items),
        'objectives.1.unit',
      ],
      [
        objective('1', 'missing-recipe', 11, 0, ObjectiveUnit.Machines),
        'objectives.1.targetId',
      ],
      [
        objective('1', 'originium_ore', 11, 1, ObjectiveUnit.Machines),
        'objectives.1.value',
      ],
      [
        objective('1', 'originium_ore', 12, -1, ObjectiveUnit.Machines),
        'objectives.1.value',
      ],
      [
        objective('1', 'originium_ore', 12, 1, ObjectiveUnit.Machines),
        'objectives.1.recipe.output.originium_ore',
      ],
      [
        objective('1', 'originium_ore', 12, 1, ObjectiveUnit.Machines),
        'objectives.1.recipe.output.originium_ore',
        { '1': prepared('1', 'originium_ore', rational.zero) },
      ],
      [
        objective('1', 'originium_ore', 12, 1, ObjectiveUnit.Machines),
        'objectives.1.recipe.output.originium_ore',
        { '1': prepared('1', 'iron_ore', rational.one) },
      ],
      [
        objective('1', 'miner_4', 13, 1, ObjectiveUnit.Items),
        'objectives.1.targetId',
      ],
      [
        objective('1', 'xiranite_oven_1', 13, 1, ObjectiveUnit.Machines),
        'objectives.1.targetId',
      ],
      [
        objective('1', 'domain_key_tundra', 14, 1, ObjectiveUnit.Machines),
        'objectives.1.targetId',
      ],
      [
        objective('1', 'domain_key_jinlong', 14, 1, ObjectiveUnit.Items),
        'objectives.1.targetId',
      ],
      [
        objective('1', 'originium_ore', 15, 1, ObjectiveUnit.Machines),
        'objectives.1.type',
      ],
      [
        objective('1', 'originium_ore', 0, 1, 9 as ObjectiveUnit),
        'objectives.1.unit',
      ],
    ];
    for (const [goal, field, preparedObjectives] of cases) {
      const state: WorkspaceState = {
        objectivesState: { '1': goal },
        settingsState: { checkedObjectiveIds: new Set(['1']) },
      };
      expectDiagnostic(
        () => decode(state, { v: '11' }, preparedObjectives),
        field,
      );
      expect(state.objectivesState?.['1']).toBe(goal);
      expect(state.settingsState?.checkedObjectiveIds).toEqual(new Set(['1']));
    }
    const legacy = {
      objectivesState: {
        '1': objective('1', 'originium_ore', 11, 0, ObjectiveUnit.Machines),
      },
    };
    expectDiagnostic(() => decode(legacy, { v: '12' }), 'objectives.1.type');
    expectDiagnostic(() => decode({}, { v: '12', cet: '1' }), 'cet');
  });

  it('copies legacy settings deeply and uses the last duplicate supply and transfer without changing input', () => {
    const firstSettings = {
      machineId: 'miner_4',
      fuelId: 'test-fuel',
      overclock: rational(125),
      modules: [{ id: 'test-module', count: rational(2) }],
      beacons: [
        {
          id: 'test-beacon',
          count: rational.one,
          total: rational(2),
          modules: [{ id: 'test-module', count: rational.one }],
        },
      ],
    };
    const input: WorkspaceState = {
      objectivesState: {
        '1': objective(
          '1',
          'copper_ore-liquid_water',
          12,
          2,
          ObjectiveUnit.Machines,
          firstSettings,
        ),
        '2': objective(
          '2',
          'copper_ore-liquid_water',
          12,
          4,
          ObjectiveUnit.Machines,
          firstSettings,
        ),
        '3': objective('3', 'domain_key_tundra', 14, 1, ObjectiveUnit.Items),
        '4': objective('4', 'domain_key_tundra', 14, 1, ObjectiveUnit.Items),
      },
      settingsState: { checkedObjectiveIds: new Set(['2']) },
    };
    const params = { v: '11' };
    const plan = prepareEndfield({ params });
    const result = decodeWorkspace({
      state: input,
      params,
      plan,
      data: supportedData,
      hash,
      preparedObjectives: {
        '1': prepared('1', 'copper_ore', rational(1, 3)),
        '2': prepared('2', 'copper_ore', rational(2, 3)),
      },
    });
    const extension = result.extension as EndfieldState;
    expect(extension.resourceLimits.rates.copper_ore).toEqual(rational(8, 3));
    expect(extension.resourceRecipeSettings.copper_ore).toEqual(firstSettings);
    expect(extension.resourceRecipeSettings.copper_ore?.modules).not.toBe(
      firstSettings.modules,
    );
    expect(
      extension.resourceRecipeSettings.copper_ore?.beacons?.[0].modules,
    ).not.toBe(firstSettings.beacons[0].modules);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      'duplicate-legacy-objective',
      'duplicate-legacy-objective',
    ]);
    firstSettings.modules[0].id = 'changed';
    firstSettings.beacons[0].modules[0].id = 'changed';
    expect(extension.resourceRecipeSettings.copper_ore?.modules?.[0].id).toBe(
      'test-module',
    );
    expect(
      extension.resourceRecipeSettings.copper_ore?.beacons?.[0].modules?.[0].id,
    ).toBe('test-module');
    expect(input.settingsState?.checkedObjectiveIds).toEqual(new Set(['2']));
  });

  it('uses the later duplicate supply settings even when the later settings are empty', () => {
    const state: WorkspaceState = {
      objectivesState: {
        '1': objective(
          '1',
          'copper_ore-liquid_water',
          12,
          2,
          ObjectiveUnit.Machines,
          { machineId: 'miner_4' },
        ),
        '2': objective(
          '2',
          'copper_ore-liquid_water',
          12,
          3,
          ObjectiveUnit.Machines,
        ),
      },
    };
    const output = decode(
      state,
      { v: '11' },
      {
        '1': prepared('1', 'copper_ore', rational(1, 3)),
        '2': prepared('2', 'copper_ore', rational(1, 3)),
      },
    );
    const extension = output.extension as EndfieldState;
    expect(extension.resourceLimits.rates.copper_ore).toEqual(rational.one);
    expect(extension.resourceRecipeSettings.copper_ore).toBeUndefined();
    expect(output.diagnostics.map((entry) => entry.code)).toEqual([
      'duplicate-legacy-objective',
    ]);
    expect(state.objectivesState?.['1'].machineId).toBe('miner_4');
  });

  it('distinguishes an enabled zero limit, and never falls back from invalid ef to legacy', () => {
    const state: WorkspaceState = {
      objectivesState: {
        '1': objective('1', 'originium_ore', 11, 0, ObjectiveUnit.Machines),
      },
    };
    const output = decode(state);
    expect(
      (output.extension as EndfieldState).resourceLimits.enabled,
    ).toBeTrue();
    expect(
      (output.extension as EndfieldState).resourceLimits.rates.originium_ore,
    ).toEqual(rational.zero);
    expect(output.state.objectivesState).toEqual({});
    const unknownVersion = btoa('{"version":2}').replace(/=+$/, '');
    for (const ef of ['broken', unknownVersion]) {
      const params = { v: '11', ef, cet: '3' };
      const original = { ...params };
      const plan = prepareEndfield({ params });
      expectDiagnostic(
        () => preflightWorkspace({ state, plan, data }),
        ef === 'broken' ? 'ef' : 'ef.version',
        ef === 'broken'
          ? 'invalid-endfield-state'
          : 'unsupported-endfield-version',
      );
      expectDiagnostic(
        () => decode(state, params),
        ef === 'broken' ? 'ef' : 'ef.version',
        ef === 'broken'
          ? 'invalid-endfield-state'
          : 'unsupported-endfield-version',
      );
      expect(params).toEqual(original);
      expect(Number(state.objectivesState?.['1'].type)).toBe(11);
    }
  });

  it('aliases the confirmed retired recipe only in legacy recipe objectives', () => {
    expect(legacyHash.recipes).toContain('xiranite_powder');
    expect(
      data.recipes.some((entry) => entry.id === 'xiranite_powder'),
    ).toBeFalse();
    expect(
      data.items.some((entry) => entry.id === 'xiranite_powder'),
    ).toBeTrue();
    const recipeGoal = objective(
      '1',
      'xiranite_powder',
      0,
      4,
      ObjectiveUnit.Machines,
      {
        machineId: 'xiranite_oven_1',
        overclock: rational(125),
      },
    );
    const state: WorkspaceState = {
      objectivesState: {
        '1': recipeGoal,
        '2': objective('2', 'xiranite_powder', 1, 7, ObjectiveUnit.Items),
      },
    };
    const output = decode(state);
    expect(output.state.objectivesState?.['1']).toEqual({
      ...recipeGoal,
      targetId: 'xiranite_powder-carbon_enr',
    });
    expect(output.state.objectivesState?.['2']).toEqual(
      state.objectivesState?.['2'],
    );
    expect(state.objectivesState?.['1'].targetId).toBe('xiranite_powder');
    expectDiagnostic(() => decode(state, { v: '12' }), 'objectives.1.targetId');
  });

  it('does not hide invalid fields, retired objectives or unknown special targets', () => {
    const invalidStates: WorkspaceState[] = [
      {
        objectivesState: {
          '1': objective('1', 'missing', 0, 1, ObjectiveUnit.Items),
        },
      },
      {
        objectivesState: {
          '1': objective('1', 'originium_ore', 10, 0, ObjectiveUnit.Machines),
        },
      },
      {
        objectivesState: {
          '1': objective('1', 'iron_ore', 12, 1, ObjectiveUnit.Machines),
        },
      },
      {
        objectivesState: {
          '1': objective('1', 'domain_key_jinlong', 14, 1, ObjectiveUnit.Items),
        },
      },
      { itemsState: { missing: { beltId: 'belt' } } },
      { recipesState: { missing: { machineId: 'miner_4' } } },
      { machinesState: { missing: { overclock: rational(100) } } },
      { settingsState: { checkedItemIds: new Set(['missing']) } },
    ];
    for (const state of invalidStates)
      expect(() => decode(state)).toThrowError(WorkspaceRestoreError);
    expect(() => decode({}, { v: '11', cet: '-1' })).toThrowError(
      WorkspaceRestoreError,
    );
    expect(() => decode({}, { v: '11', cet: '2', ef: 'corrupt' })).toThrowError(
      WorkspaceRestoreError,
    );
    expect(
      (decode({}, { v: '12' }).extension as EndfieldState).electric,
    ).toEqual(rational.one);
  });
});
