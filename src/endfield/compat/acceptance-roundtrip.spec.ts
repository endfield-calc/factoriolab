import { TestBed } from '@angular/core/testing';
import { loadModule } from 'glpk-ts';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
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
import { WorkspaceLifecycle } from '~/state/workspace-lifecycle';
import { TestModule } from '~/tests/test-module';

import {
  createEndfieldState,
  resourceObjectiveId,
  resourceOwner,
} from '../domain/model';
import { provideEndfield } from '../providers';
import { EndfieldStore } from '../state/endfield-store';

const data = rawData as unknown as ModData;
const hash = rawHash as unknown as ModHash;

describe('Endfield derived round trips', () => {
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
    const params = await router.unzipQueryParams(
      query ? router.toParams(query) : {},
    );
    const migrated = TestBed.inject(Migration).migrate('aef', params);
    router.updateState(
      migrated.modId,
      migrated.params,
      migrated.isBare,
      dataset,
      hash,
      ticket,
    );
    expect(lifecycle.ready())
      .withContext(JSON.stringify(lifecycle.errors()))
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
      endfield: endfield.snapshot(),
    });
  }

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
    endfield.setResourceChecked('originium_ore', true);
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
    const expectedObjectives = objectives.state();
    const expectedEndfield = endfield.snapshot();
    expect(expectedEndfield.checkedDerived).toEqual(
      new Set([resourceOwner('originium_ore')]),
    );
    expect(expectedEndfield.resourceRecipeSettings.originium_ore).toEqual({
      machineId: 'miner_3',
      overclock: rational(125),
    });
    const zipped = zip();
    expect(zipped.config.bare.och).toBe('A');
    expect(zipped.config.bare.rex).toBeDefined();
    expect(zipped.config.bare.csu).toBe('0');
    expect(zipped.config.bare.cun).toBeUndefined();
    expect(zipped.config.bare.cre).toBeUndefined();
    const ef = zipped.config.bare.ef!;
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
      expect(objectives.state()).withContext(mode).toEqual(expectedObjectives);
      expect(endfield.snapshot()).withContext(mode).toEqual(expectedEndfield);
      expect(zip()).withContext(mode).toEqual(zipped);
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
      expect(restoredDerived.recipeSettings?.machineId)
        .withContext(mode)
        .toBe('miner_3');
      expect(restoredDerived.recipeSettings?.overclock)
        .withContext(mode)
        .toEqual(rational(125));
    }
  });
});
