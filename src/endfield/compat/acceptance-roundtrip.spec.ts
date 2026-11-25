import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { loadModule } from 'glpk-ts';

import { emptyModData, ModData } from '~/data/schema/mod-data';
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
import { TestModule } from '~/tests/test-module';

import { endfieldAdjustmentProvider } from '../adapters/calculation-extension';
import {
  createEndfieldState,
  resourceObjectiveId,
  resourceRecipes,
} from '../domain/model';
import { EndfieldStore } from '../state/endfield-store';
import { decodeEndfield, encodeEndfield } from './codec';

const machine = 'fixture-machine';
const data: ModData = {
  ...emptyModData(),
  icons: [
    ...Object.keys(resourceRecipes),
    'domain_key_tundra',
    machine,
    'zone-one',
    'zone-two',
  ].map((id) => ({ id, x: 0, y: 0, color: '#fff' })),
  locations: [
    { id: 'zone-one', name: 'Zone one' },
    { id: 'zone-two', name: 'Zone two' },
  ],
  items: [
    ...Object.keys(resourceRecipes).map((id) => ({ id, name: id })),
    { id: 'domain_key_tundra', name: 'Transfer key' },
    { id: machine, name: 'Machine', machine: { speed: 1 } },
  ],
  recipes: [
    ...Object.entries(resourceRecipes).map(([item, id]) => ({
      id,
      name: id,
      time: 1,
      in: {},
      out: { [item]: 1 },
      producers: [machine],
    })),
    ...['unused-one', 'unused-two'].map((id) => ({
      id,
      name: id,
      time: 1,
      in: {},
      out: { originium_ore: 1 },
      producers: [machine],
    })),
  ],
  defaults: {
    presets: [{ id: 0, label: 'Default' }],
    locations: ['zone-one', 'zone-two'],
    machineRank: [machine],
  },
};
const hash: ModHash = {
  items: data.items.map((item) => item.id),
  recipes: data.recipes.map((recipe) => recipe.id),
  machines: [machine],
  locations: ['zone-one', 'zone-two'],
  beacons: [],
  belts: [],
  fuels: [],
  wagons: [],
  modules: [],
  technologies: [],
};

describe('Endfield derived round trips', () => {
  let router: RouterSync;
  let settings: SettingsStore;
  let objectives: ObjectivesStore;
  let endfield: EndfieldStore;
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
        endfieldAdjustmentProvider,
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
    );
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
      endfield: endfield.state(),
    });
  }

  it('preserves a derived supply and its independent settings/check through every link and save', async () => {
    settings.apply({
      locationIds: new Set(['zone-one', 'zone-two']),
      excludedRecipeIds: new Set(['unused-one', 'unused-two']),
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
      activityModes: {
        limited_formula_1: 1789521600000,
        limited_formula_2: 'disabled',
      },
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
    objectives.updateRecipeField(initialDerived, 'machineId', machine);
    objectives.updateRecipeField(initialDerived, 'overclock', rational(125));
    endfield.setResourceChecked('originium_ore', true);
    endfield.set({ ...endfield.state(), electric: rational(2) });
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
    expect(derived.recipeSettings?.machineId).toBe(machine);
    expect(
      objectives
        .calculationContext()
        .objectives.filter((o) => o.id === resourceObjectiveId('originium_ore'))
        .length,
    ).toBe(1);
    const expectedObjectives = objectives.state();
    const expectedEndfield = endfield.state();
    expect(expectedEndfield.checkedDerived).toEqual(new Set(['originium_ore']));
    expect(expectedEndfield.resourceRecipeSettings.originium_ore).toEqual({
      machineId: machine,
      overclock: rational(125),
    });
    const zipped = zip();
    expect(zipped.config.bare.och).toBe('A');
    expect(zipped.config.bare.rex).toBeDefined();
    const ef = zipped.config.bare.ef!;
    expect(decodeEndfield(ef, data)).toEqual(expectedEndfield);
    expect(ef).not.toContain('unused-one');
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
      endfield.load(undefined);
      objectives.set({});
      settings.apply({
        checkedObjectiveIds: new Set(),
        excludedRecipeIds: new Set(),
      });
      await restore(query);
      expect(objectives.state()).withContext(mode).toEqual(expectedObjectives);
      expect(endfield.state()).withContext(mode).toEqual(expectedEndfield);
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
        .toBe(machine);
      expect(restoredDerived.recipeSettings?.overclock)
        .withContext(mode)
        .toEqual(rational(125));
    }
  });

  it('keeps delimiters and Unicode machine IDs intact in bare and compressed parameters', async () => {
    const machine = 'machine!*~&=/%+中文';
    const fixture: ModData = {
      ...emptyModData(),
      items: [{ id: machine, name: 'Machine', machine: {} }],
      recipes: [
        {
          id: 'originium_ore',
          name: 'Source',
          time: 1,
          in: {},
          out: {},
          producers: [machine],
        },
      ],
    };
    const defaults = createEndfieldState();
    const state = {
      ...defaults,
      electric: rational(-7, 9),
      resourceRecipeSettings: {
        originium_ore: { machineId: machine, overclock: rational(7, 3) },
      },
    };
    const bare = { ef: encodeEndfield(state), v: '12' };
    const compressed = await router.getHashParams(bare);
    const bareString = router.toString(bare);
    const angularRouter = TestBed.inject(Router);
    const link = angularRouter.serializeUrl(
      angularRouter.createUrlTree(['/aef/list'], { queryParams: bare }),
    );
    const browserParams = new URL(`https://example.test/?${bareString}`)
      .searchParams;
    for (const params of [
      router.toParams(bareString),
      Object.fromEntries(browserParams),
      angularRouter.parseUrl(link).queryParams,
      await router.unzipQueryParams(compressed as Params),
    ])
      expect(decodeEndfield(params['ef'], fixture)).toEqual(state);
  });
});
