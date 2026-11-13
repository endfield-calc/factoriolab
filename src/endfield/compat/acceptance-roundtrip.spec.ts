import { TestBed } from '@angular/core/testing';
import { loadModule } from 'glpk-ts';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
import { PRESENTATION_EXTENSION } from '~/extensions/presentation-extension';
import { STATE_EXTENSION } from '~/extensions/state-extension';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { rational } from '~/rational/rational';
import { ItemsStore } from '~/state/items/items-store';
import { MachinesStore } from '~/state/machines/machines-store';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { LabParams } from '~/state/router/lab-params';
import { Migration } from '~/state/router/migration';
import { Params } from '~/state/router/params';
import { RouterSync, ZipState } from '~/state/router/router-sync';
import { SettingsStore } from '~/state/settings/settings-store';
import { TableStore } from '~/state/table/table-store';
import { TestModule } from '~/tests/test-module';

import {
  createEndfieldState,
  resourceObjectiveId,
  resourceOwner,
} from '../domain/model';
import { provideEndfield } from '../providers';
import { EndfieldStore } from '../state/endfield-store';
import golden from './fixtures/legacy-golden.json';
import legacyHash from './legacy-hash.json';

const data = rawData as unknown as ModData;
const hash = rawHash as unknown as ModHash;

interface StateSummary {
  objectives: {
    id: string;
    targetId: string;
    value: string;
    type: ObjectiveType;
    unit: ObjectiveUnit;
    machineId?: string;
    overclock?: string;
  }[];
  checked: string[];
  checkedItems: string[];
  locations: string[];
  excluded: string[];
  rate: number;
  costs: Record<string, string>;
  extension: {
    enabled: boolean;
    rates: Record<string, string>;
    machineEnabled: boolean;
    machineLimit: string;
    transfer: boolean;
    electric: string;
    recipe: Record<string, { machineId?: string; overclock?: string }>;
    checked: string[];
  };
}

describe('Remaining Endfield legacy and derived round trips', () => {
  let router: RouterSync;
  let settings: SettingsStore;
  let objectives: ObjectivesStore;
  let endfield: EndfieldStore;
  let lifecycle: WorkspaceLifecycle;
  let preferences: PreferencesStore;

  beforeAll(async () => {
    await loadModule('glpk.all.wasm');
  });
  beforeEach(() => {
    localStorage.removeItem('router');
    localStorage.removeItem('preferences');
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        ...provideEndfield(),
        { provide: SettingsStore, useClass: SettingsStore },
      ],
    });
    settings = TestBed.inject(SettingsStore);
    settings.apply({ modId: 'aef' });
    settings['modDataResource'].set(data);
    settings['modHashResource'].set(hash);
    router = TestBed.inject(RouterSync);
    objectives = TestBed.inject(ObjectivesStore);
    endfield = TestBed.inject(EndfieldStore);
    lifecycle = TestBed.inject(WorkspaceLifecycle);
    preferences = TestBed.inject(PreferencesStore);
    preferences.apply({ paused: false, glpkAlgorithm: 'simplex' });
  });
  afterEach(() => {
    localStorage.removeItem('router');
    localStorage.removeItem('preferences');
  });

  async function restore(
    query: string,
    dataset: ModData = data,
  ): Promise<void> {
    const ticket = lifecycle.begin(query);
    const params = await router.unzipQueryParams(router.toParams(query));
    const plan = TestBed.inject(STATE_EXTENSION).prepare({
      modId: 'aef',
      params,
    });
    const migrated = TestBed.inject(Migration).migrate(
      plan.modId,
      plan.params,
      plan.legacyModHashes,
    );
    router.updateState(
      migrated.modId,
      migrated.params,
      migrated.isBare,
      dataset,
      hash,
      plan,
      ticket,
    );
    expect(lifecycle.ready())
      .withContext(JSON.stringify(lifecycle.diagnostics()))
      .toBeTrue();
  }

  function zip(): ZipState {
    return router.zipState({
      objectives: objectives.state(),
      items: TestBed.inject(ItemsStore).state(),
      recipes: TestBed.inject(RecipesStore).state(),
      machines: TestBed.inject(MachinesStore).state(),
      settings: settings.state(),
      table: TestBed.inject(TableStore).state(),
      data: settings.dataset(),
      hash,
      extension: endfield.snapshot(),
    });
  }

  function stateSummary(): StateSummary {
    const state = endfield.state();
    return {
      objectives: Object.values(objectives.state()).map(
        ({ id, targetId, value, type, unit, machineId, overclock }) => ({
          id,
          targetId,
          value: value.toString(),
          type,
          unit,
          machineId,
          overclock: overclock?.toString(),
        }),
      ),
      checked: [...settings.state().checkedObjectiveIds].sort(),
      checkedItems: [...settings.state().checkedItemIds].sort(),
      locations: [...settings.settings().locationIds].sort(),
      excluded: [...settings.settings().excludedRecipeIds].sort(),
      rate: settings.displayRate(),
      costs: Object.fromEntries(
        Object.entries(settings.state().costs).map(([id, value]) => [
          id,
          value.toString(),
        ]),
      ),
      extension: {
        enabled: state.resourceLimits.enabled,
        rates: Object.fromEntries(
          Object.entries(state.resourceLimits.rates).map(([id, v]) => [
            id,
            v.toString(),
          ]),
        ),
        machineEnabled: state.machineLimits.enabled,
        machineLimit: state.machineLimits.limits['xiranite_oven_1'].toString(),
        transfer: state.transfer.enabled,
        electric: state.electric.toString(),
        recipe: Object.fromEntries(
          Object.entries(state.resourceRecipeSettings).map(([id, v]) => [
            id,
            { machineId: v?.machineId, overclock: v?.overclock?.toString() },
          ]),
        ),
        checked: [...state.checkedDerived].sort(),
      },
    };
  }

  it('A20 restores complete v11 types, edits ordinary goals, then restores the edited URL', async () => {
    // G06 uses legacy serialized fields; add a second ordinary goal and checked indices.
    const query =
      'o=originium_powder*100&o=originium_ore*0*3*11&o=originium_ore*28*3*12&o=xiranite_oven_1*12**13&o=domain_key_tundra*1**14&o=copper_nugget*200&och=A*C*F&cet=2&odr=3&loc=A~B&rex=Cn~Co&v=11';
    await restore(query);
    const initial = stateSummary();
    expect(initial.objectives.map((o) => o.targetId)).toEqual([
      'originium_powder',
      'copper_nugget',
    ]);
    expect(initial.checked).toEqual(['1', '2']);
    expect(initial.locations).toEqual(['jinlong', 'tundra']);
    expect(initial.excluded).toContain('sewage-treat');
    expect(initial.excluded).toContain('sewage-treat-export');
    expect(initial.rate).toBe(3);
    expect(
      endfield.state().resourceLimits.rates.originium_ore.eq(rational(560, 60)),
    ).toBeTrue();
    expect(initial.extension.machineEnabled).toBeTrue();
    expect(initial.extension.machineLimit).toBe('12');
    expect(initial.extension.transfer).toBeTrue();
    expect(initial.extension.electric).toBe('2');
    expect(initial.extension.checked).toEqual([resourceOwner('originium_ore')]);
    objectives.add({
      targetId: 'iron_ore',
      value: rational(4),
      type: ObjectiveType.Output,
      unit: ObjectiveUnit.Items,
    });
    expect(Object.values(objectives.state()).map((o) => o.targetId)).toEqual([
      'originium_powder',
      'copper_nugget',
      'iron_ore',
    ]);
    objectives.remove('3');
    objectives.add({
      targetId: 'quartz_sand',
      value: rational(5),
      type: ObjectiveType.Output,
      unit: ObjectiveUnit.Items,
    });
    const ordered = Object.values(objectives.state());
    objectives.setOrder([ordered[1], ordered[0], ordered[2]]);
    const edited = stateSummary();
    expect(edited.objectives.map((o) => o.targetId)).toEqual([
      'copper_nugget',
      'originium_powder',
      'quartz_sand',
    ]);
    expect(edited.checked).toEqual(['1', '2']);
    expect(edited.extension).toEqual(initial.extension);
    expect(edited.locations).toEqual(initial.locations);
    expect(edited.excluded).toEqual(initial.excluded);
    const params = await router.getHash(zip());
    const encoded = router.toString(params as Params);
    objectives.set({});
    endfield.reset();
    await restore(encoded);
    expect(stateSummary()).toEqual(edited);
    console.info(
      '[remaining-roundtrip] A20',
      JSON.stringify({ query, encoded, summary: stateSummary() }),
    );
  });

  it('A21 restores the same original compressed links with reordered copied data and the frozen hash', async () => {
    const originalData = JSON.stringify(data);
    const originalHash = JSON.stringify(hash);
    const reordered: ModData = {
      ...data,
      categories: [...data.categories].reverse(),
      icons: [...data.icons].reverse(),
      items: [...data.items].reverse(),
      recipes: [...data.recipes].reverse(),
      locations: [...(data.locations ?? [])].reverse(),
    };
    expect(reordered.items[0].id).not.toBe(data.items[0].id);
    expect(reordered.recipes[0].id).not.toBe(data.recipes[0].id);
    for (const fixture of golden.cases.filter((entry) =>
      entry.url.includes('?z='),
    )) {
      const query = fixture.url.slice(fixture.url.indexOf('?') + 1);
      settings['modDataResource'].set(data);
      await restore(query);
      const normal = stateSummary();
      const params = await router.unzipQueryParams(router.toParams(query));
      const plan = TestBed.inject(STATE_EXTENSION).prepare({
        modId: 'aef',
        params,
      });
      expect(plan.hash).toEqual(legacyHash);
      const prepared = settings.prepareState(
        { modId: 'aef' },
        reordered,
        plan.hash!,
      );
      expect(prepared.data.itemRecord[reordered.items[0].id].id).toBe(
        reordered.items[0].id,
      );
      expect(prepared.data.recipeRecord[reordered.recipes[0].id].id).toBe(
        reordered.recipes[0].id,
      );
      settings['modDataResource'].set(reordered);
      await restore(query, reordered);
      const changed = stateSummary();
      expect(changed).withContext(fixture.id).toEqual(normal);
      if (fixture.id === 'G03') {
        const alias = changed.objectives.find(
          (o) => o.targetId === 'xiranite_powder-carbon_enr',
        );
        expect(alias?.value).toBe('4');
        expect(alias?.unit).toBe(ObjectiveUnit.Machines);
      }
      console.info(
        '[remaining-roundtrip] A21',
        fixture.id,
        JSON.stringify({
          query,
          objectives: changed.objectives,
          locations: changed.locations,
          excluded: changed.excluded,
        }),
      );
    }
    expect(JSON.stringify(data)).toBe(originalData);
    expect(JSON.stringify(hash)).toBe(originalHash);
  });

  it('A30 preserves one real derived supply and its independent settings/check through every link and save', async () => {
    settings.apply({
      locationIds: new Set(['tundra', 'jinlong']),
      excludedRecipeIds: new Set(['sewage-treat', 'sewage-treat-export']),
      checkedObjectiveIds: new Set(['1']),
      costs: {
        ...settings.state().costs,
        surplus: rational.zero,
        unproduceable: rational(100000000),
        recycling: rational.one,
      },
    });
    objectives.set({
      1: {
        id: '1',
        targetId: 'originium_ore',
        value: rational.one,
        type: ObjectiveType.Output,
        unit: ObjectiveUnit.Machines,
      },
    });
    const base = createEndfieldState();
    endfield.set({
      ...base,
      resourceLimits: {
        enabled: true,
        rates: {
          ...base.resourceLimits.rates,
          originium_ore: rational(560, 60),
        },
      },
    });
    const ordinaryBefore = Object.values(objectives.state()).map((o) => ({
      ...o,
    }));
    expect(objectives.matrixResult().resultType).toBe('solved');
    const initialDerived = objectives
      .steps()
      .find(
        (step) =>
          step.recipeObjectiveId === resourceObjectiveId('originium_ore'),
      )!;
    expect(initialDerived).toBeDefined();
    expect(initialDerived.itemId).toBeUndefined();
    objectives.updateRecipeField(initialDerived, 'machineId', 'miner_3');
    objectives.updateRecipeField(initialDerived, 'overclock', rational(125));
    expect(
      TestBed.inject(PRESENTATION_EXTENSION).toggleChecked(
        initialDerived,
        true,
      ),
    ).toBeTrue();
    endfield.set({ ...endfield.snapshot(), electric: rational(2) });
    expect(Object.values(objectives.state())).toEqual(ordinaryBefore);
    expect(objectives.matrixResult().resultType).toBe('solved');
    const derived = objectives
      .steps()
      .find(
        (step) =>
          step.recipeObjectiveId === resourceObjectiveId('originium_ore'),
      )!;
    expect(derived).toBeDefined();
    expect(derived.itemId).toBeUndefined();
    expect(derived.checked).toBeTrue();
    expect(derived.recipeSettings?.machineId).toBe('miner_3');
    expect(
      objectives
        .calculationContext()
        .objectives.filter((o) => o.id === resourceObjectiveId('originium_ore'))
        .length,
    ).toBe(1);
    const expected = stateSummary();
    expect(expected.objectives.map((o) => o.targetId)).toEqual([
      'originium_ore',
    ]);
    expect(expected.extension.checked).toEqual([
      resourceOwner('originium_ore'),
    ]);
    expect(expected.extension.recipe['originium_ore']).toEqual({
      machineId: 'miner_3',
      overclock: '125',
    });
    const zipped = zip();
    expect(zipped.config.bare.och).toBe('A');
    expect(zipped.config.bare.rex).toBeDefined();
    expect(zipped.config.bare.csu).toBe('0');
    expect(zipped.config.bare.cun).toBe('100000000');
    expect(zipped.config.bare.cre).toBe('1');
    const ef = (zipped.config.bare as Params)['ef'] as string;
    const payload = JSON.parse(atob(ef.replace(/-/g, '+').replace(/_/g, '/')));
    expect(JSON.stringify(payload)).not.toContain('sewage-treat');
    const bare: LabParams = {
      ...zipped.objectives.bare,
      ...zipped.config.bare,
      v: '12',
    };
    const compressed = await router.getHashParams({
      ...zipped.objectives.hash,
      ...zipped.config.hash,
      v: '12',
    });
    expect(compressed.z).toBeDefined();
    const href = await router.stepHref(derived, zipped.config);
    expect(href).not.toBeNull();
    const stored = `/aef/list?${router.toString((await router.getHash(zipped)) as Params)}`;
    preferences.saveState('aef', 'derived-acceptance', stored);
    const saved = preferences.states()['aef']['derived-acceptance'];
    for (const [mode, query] of [
      ['bare', router.toString(bare as Params)],
      ['compressed', router.toString(compressed as Params)],
      ['saved', saved.slice(saved.indexOf('?') + 1)],
      ['stepHref', router.toString(href as Params)],
    ] as const) {
      endfield.reset();
      objectives.set({});
      settings.apply({
        checkedObjectiveIds: new Set(),
        excludedRecipeIds: new Set(),
      });
      await restore(query);
      expect(stateSummary()).withContext(mode).toEqual(expected);
      expect(
        objectives
          .calculationContext()
          .objectives.filter(
            (o) => o.id === resourceObjectiveId('originium_ore'),
          ).length,
      )
        .withContext(mode)
        .toBe(1);
      expect(objectives.state()['1'].targetId)
        .withContext(mode)
        .toBe('originium_ore');
      expect(objectives.matrixResult().resultType)
        .withContext(mode)
        .toBe('solved');
      const restoredDerived = objectives
        .steps()
        .find(
          (step) =>
            step.recipeObjectiveId === resourceObjectiveId('originium_ore'),
        )!;
      expect(restoredDerived.itemId).withContext(mode).toBeUndefined();
      expect(restoredDerived.checked).withContext(mode).toBeTrue();
      console.info(
        '[remaining-roundtrip] A30',
        mode,
        JSON.stringify({ query, summary: stateSummary() }),
      );
    }
  });
});
