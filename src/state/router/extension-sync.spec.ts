import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import rawTransfer from '/public/data/aef/transfer.json';
import { Id } from '~/app/id/id';
import { shortcutRoutes } from '~/app/id/id-guard';
import { ModData } from '~/data/schema/mod-data';
import { encodeEndfield } from '~/endfield/compat/codec';
import {
  createEndfieldState,
  resourceObjectiveId,
} from '~/endfield/domain/model';
import { EndfieldTransferData } from '~/endfield/domain/transfer';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { rational } from '~/rational/rational';
import { MockComponent } from '~/tests/mocks/component';
import { TestModule } from '~/tests/test-module';

import { ObjectiveType } from '../objectives/objective-type';
import { ObjectiveUnit } from '../objectives/objective-unit';
import { initialSettingsState } from '../settings/settings-state';
import { initialTableState } from '../table/table-state';
import { Params } from './params';
import { RouterSync } from './router-sync';

const data = rawData as unknown as ModData;

async function flush(): Promise<void> {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}

describe('RouterSync Endfield links', () => {
  let service: RouterSync;
  let endfield: EndfieldStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    service = TestBed.inject(RouterSync);
    endfield = TestBed.inject(EndfieldStore);
    service['settingsStore'].apply({ modId: 'aef' });
    service['settingsStore']['modDataResource'].set(data);
    service['settingsStore']['modHashResource'].set(rawHash);
    service['settingsStore']['transferResource'].set(
      rawTransfer as EndfieldTransferData,
    );
  });

  async function restore(query: Params): Promise<void> {
    const unpacked = await service.unzipQueryParams(query);
    const migrated = service['migration'].migrate('aef', unpacked);
    service.updateState(
      migrated.modId,
      migrated.params,
      migrated.isBare,
      data,
      rawHash,
    );
  }

  it('round trips ordinary and compressed ef and resets it when absent', async () => {
    const extension = {
      ...createEndfieldState(),
      electric: rational(3),
      checkedDerived: new Set(['originium_ore' as const]),
    };
    const zipped = service.zipState({
      objectives: {},
      items: {},
      recipes: {},
      machines: {},
      settings: { ...initialSettingsState, modId: 'aef' },
      table: initialTableState,
      data: service['settingsStore'].dataset(),
      hash: rawHash,
      endfield: extension,
    });
    expect(zipped.config.bare.ef).toBe(encodeEndfield(extension));
    expect(zipped.config.hash.ef).toBe(zipped.config.bare.ef);
    const compressed = await service.getHashParams({
      ...zipped.config.hash,
      v: '12',
    });
    for (const query of [{ ...zipped.config.bare, v: '12' }, compressed]) {
      endfield.load(undefined);
      await restore(query as Params);
      expect(endfield.state()).toEqual(extension);
    }
    await restore({ v: '12' });
    expect(endfield.state()).toEqual(createEndfieldState());
    const defaults = service.zipState({
      objectives: {},
      items: {},
      recipes: {},
      machines: {},
      settings: { ...initialSettingsState, modId: 'aef' },
      table: initialTableState,
      data: service['settingsStore'].dataset(),
      hash: rawHash,
      endfield: createEndfieldState(),
    });
    expect(defaults.config.bare.ef).toBeUndefined();
    expect(defaults.config.hash.ef).toBeUndefined();
  });

  for (const swapped of [false, true]) {
    it(`preserves both link formats when hidden IDs are ${swapped ? 'checked' : 'excluded'}`, async () => {
      const settingsStore = service['settingsStore'];
      const activities = data.endfield!.activities;
      settingsStore.setActivityMode(
        'limited_formula_1',
        activities['limited_formula_1'].openTime,
      );
      settingsStore.setActivityMode(
        'limited_formula_2',
        activities['limited_formula_2'].openTime,
      );
      const hiddenItems = new Set([
        'pipe',
        'iron_bottle-liquid_plant_grass_1',
        'activity_xiranite_lung',
      ]);
      const acrossItems = new Set([
        'settlement-tundra',
        'activity_xiranite_cmpt',
      ]);
      const hiddenRecipes = new Set([
        'carbon_enr',
        'carbon_mtl-plant_moss_1',
        'activity_xiranite_lung',
      ]);
      const acrossRecipes = new Set([
        'jinlong_coupon-filter_core',
        'jinlong_coupon-activity_xiranite_hulu',
      ]);
      const selections = {
        excludedItemIds: swapped ? acrossItems : hiddenItems,
        checkedItemIds: swapped ? hiddenItems : acrossItems,
        excludedRecipeIds: swapped ? acrossRecipes : hiddenRecipes,
        checkedRecipeIds: swapped ? hiddenRecipes : acrossRecipes,
      };
      settingsStore.apply(selections);
      expect(settingsStore.dataset().itemIds).toContain(
        'activity_xiranite_lung',
      );
      expect(settingsStore.dataset().recipeIds).toContain(
        'activity_xiranite_lung',
      );

      settingsStore.setActivityMode('limited_formula_2', 'disabled');
      const filtered = settingsStore.dataset();
      expect(filtered.itemIds).not.toContain('activity_xiranite_lung');
      expect(filtered.recipeIds).not.toContain('activity_xiranite_lung');
      expect(filtered.itemIds).toContain('settlement-tundra');
      expect(filtered.itemIds).toContain('activity_xiranite_cmpt');
      expect(filtered.recipeIds).toContain('jinlong_coupon-filter_core');
      expect(filtered.recipeIds).toContain(
        'jinlong_coupon-activity_xiranite_hulu',
      );

      const zipped = service.zipState({
        objectives: {},
        items: {},
        recipes: {},
        machines: {},
        settings: settingsStore.state(),
        table: initialTableState,
        data: filtered,
        hash: rawHash,
        endfield: endfield.state(),
      });
      const compressed = await service.getHashParams({
        ...zipped.config.hash,
        v: '12',
      });

      for (const query of [{ ...zipped.config.bare, v: '12' }, compressed]) {
        settingsStore.apply({
          excludedItemIds: new Set(),
          checkedItemIds: new Set(),
          excludedRecipeIds: undefined,
          checkedRecipeIds: new Set(),
        });
        endfield.load(undefined);
        await restore(query as Params);
        for (const key of Object.keys(
          selections,
        ) as (keyof typeof selections)[])
          expect(settingsStore.state()[key])
            .withContext(key)
            .toEqual(selections[key]);
        expect(settingsStore.activityModes()['limited_formula_2']).toBe(
          'disabled',
        );
        expect(settingsStore.dataset().itemIds).not.toContain(
          'activity_xiranite_lung',
        );
        expect(settingsStore.dataset().recipeIds).not.toContain(
          'activity_xiranite_lung',
        );

        settingsStore.setActivityMode(
          'limited_formula_2',
          activities['limited_formula_2'].openTime,
        );
        expect(settingsStore.dataset().itemIds).toContain(
          'activity_xiranite_lung',
        );
        expect(settingsStore.dataset().recipeIds).toContain(
          'activity_xiranite_lung',
        );
        for (const key of Object.keys(
          selections,
        ) as (keyof typeof selections)[])
          expect(settingsStore.state()[key])
            .withContext(key)
            .toEqual(selections[key]);
      }
    });
  }

  it('writes Endfield changes through the native URL sync and cache', async () => {
    const router = TestBed.inject(Router);
    spyOnProperty(router, 'url').and.returnValue('/aef/list');
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    spyOn(service, 'getHash').and.callFake((value) =>
      Promise.resolve(value.config.bare),
    );
    service['ready'].set(true);
    TestBed.tick();
    await flush();
    navigate.calls.reset();
    const state = { ...createEndfieldState(), electric: rational(3) };
    endfield.set(state);
    TestBed.tick();
    await flush();
    expect(navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ ef: encodeEndfield(state) }),
      }),
    );
    expect(service.stored()).toBe('/aef/list');
  });

  it('keeps the workspace for source links and only the target for ordinary links', async () => {
    const settings = {
      ...initialSettingsState,
      modId: 'aef',
      checkedObjectiveIds: new Set(['2']),
    };
    const objectives = {
      '1': {
        id: '1',
        targetId: 'xiranite_powder',
        value: rational.one,
        unit: ObjectiveUnit.Items,
        type: ObjectiveType.Output,
      },
      '2': {
        id: '2',
        targetId: 'carbon_enr',
        value: rational.one,
        unit: ObjectiveUnit.Items,
        type: ObjectiveType.Output,
      },
    };
    const extension = {
      ...createEndfieldState(),
      checkedDerived: new Set(['originium_ore' as const]),
      transferEnabled: true,
    };
    service['objectivesStore'].set(objectives);
    service['settingsStore'].set(settings);
    endfield.set(extension);
    const zipped = service.zipState({
      objectives,
      items: {},
      recipes: {},
      machines: {},
      settings,
      table: initialTableState,
      data: service['settingsStore'].dataset(),
      hash: rawHash,
      endfield: extension,
    });
    const ordinary = await service.stepHref(
      { id: 'ordinary', itemId: 'xiranite_powder', items: rational(5) },
      zipped.config,
    );
    const source = await service.stepHref(
      { id: 'source', recipeObjectiveId: resourceObjectiveId('originium_ore') },
      zipped.config,
    );
    const transferId = [...service['recipesStore'].transferRecipeIds()][0];
    expect(transferId).toBeDefined();
    const transfer = await service.stepHref(
      { id: 'transfer', recipeId: transferId, machines: rational.one },
      zipped.config,
    );
    expect(ordinary).not.toBeNull();
    expect(source).not.toBeNull();
    expect(transfer).not.toBeNull();
    await restore(ordinary as Params);
    expect(Object.keys(service['objectivesStore'].state())).toEqual(['1']);
    expect(service['objectivesStore'].state()['1'].value).toEqual(rational(5));
    expect(service['settingsStore'].state().checkedObjectiveIds.size).toBe(0);
    expect(endfield.state().checkedDerived).toEqual(extension.checkedDerived);
    await restore(source as Params);
    expect(Object.keys(service['objectivesStore'].state())).toEqual(['1', '2']);
    expect(service['settingsStore'].state().checkedObjectiveIds).toEqual(
      new Set(['2']),
    );
    expect(endfield.state().checkedDerived).toEqual(extension.checkedDerived);
    expect(zipped.config.bare.och).toBe('B');
    await restore(transfer as Params);
    expect(Object.keys(service['objectivesStore'].state())).toEqual(['1', '2']);
    expect(
      Object.values(service['objectivesStore'].state()).some(
        (obj) => obj.targetId === transferId,
      ),
    ).toBeFalse();
    expect(endfield.state().transferEnabled).toBeTrue();
  });

  it('leaves ordinary 11-14 objectives and cet to upstream migration', async () => {
    await restore({
      v: '12',
      o: [
        'xiranite_powder*2',
        'originium_ore*2*3*11',
        'originium_ore*3*3*12',
        'xiranite_oven_1*4*0*13',
        'xiranite_powder*1*0*14',
      ],
      cet: 'invalid',
    });
    expect(
      Object.values(service['objectivesStore'].state()).map(
        (o): number => o.type,
      ),
    ).toEqual([0, 11, 12, 13, 14]);
    expect(encodeEndfield(endfield.state())).toBeUndefined();
  });

  it('imports a published v11 hashed Endfield objective', async () => {
    await restore({ v: '11', z: 'eJwrszU0VMu3TdQyVUtOLbGtAAAl.gS.' });
    expect(service['objectivesStore'].state()['1']).toEqual(
      jasmine.objectContaining({
        targetId: 'originium_ore',
        value: rational(5),
      }),
    );
  });

  it('imports the v10 Endfield mod slot and its hashed objective', async () => {
    await restore({ v: '10', z: 'eJwrMzRQSwpUK0jUMgUAEqUDBw__' });
    expect(service['objectivesStore'].state()['1']).toEqual(
      jasmine.objectContaining({
        targetId: 'originium_ore',
        value: rational(5),
      }),
    );
  });
});

describe('RouterSync foreign migration redirects', () => {
  let service: RouterSync;
  let router: Router;
  let applied: jasmine.Spy;
  let navigations: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        provideRouter([
          ...shortcutRoutes,
          {
            path: 'aef',
            component: Id,
            children: [
              { path: '', pathMatch: 'full', component: MockComponent },
              { path: 'list', component: MockComponent },
            ],
          },
        ]),
      ],
    });
    service = TestBed.inject(RouterSync);
    router = TestBed.inject(Router);
    applied = spyOn(service['settingsStore'], 'apply').and.callThrough();
    spyOn(service, 'updateUrl').and.resolveTo();
    navigations = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd)
        navigations.push(event.urlAfterRedirects);
    });
  });

  function observeMigration(): {
    complete: Promise<void>;
    spy: jasmine.Spy;
  } {
    let finish!: () => void;
    const complete = new Promise<void>((resolve) => (finish = resolve));
    const migration = service['migration'];
    const migrate = migration.migrate.bind(migration);
    const spy = spyOn(migration, 'migrate').and.callFake((modId, params) => {
      const result = migrate(modId, params);
      finish();
      return result;
    });
    return { complete, spy };
  }

  for (const [label, input, inflated] of [
    ['bare legacy mod', '/aef/list?v=10&b=1.1', undefined],
    ['compressed legacy mod', '/aef/list?v=10&z=old', 'v=10&b=A'],
    [
      'removed legacy hash slot',
      '/list?z=eJwrMzRQSwpQK0jUMgUAEp8DBg__&v=10',
      undefined,
    ],
    ['removed v0 mod', '/aef/list?s=space-exploration', undefined],
    ['matrix mod', '/aef;id=1.1/list?v=12&o=wood*2', undefined],
  ] as const) {
    it(`redirects ${label} to a clean aef route before applying any other mod`, async () => {
      if (inflated)
        spyOn(service['compression'], 'inflate').and.resolveTo(inflated);
      const navigate = spyOn(router, 'navigateByUrl').and.callThrough();
      const migration = observeMigration();
      await RouterTestingHarness.create(input);
      await migration.complete;
      const redirect = navigate.calls
        .all()
        .find((call) => call.args[0] === '/aef');
      expect(redirect).toBeDefined();
      if (redirect) await redirect.returnValue;
      expect(router.url).toBe('/aef');
      expect(navigations.filter((url) => url === '/aef').length).toBe(1);
      expect(
        applied.calls.allArgs().every(([value]) => value.modId === 'aef'),
      ).toBeTrue();
      TestBed.inject(HttpTestingController).expectNone((request) =>
        /^data\/(?!aef\/)/.test(request.url),
      );
    });
  }

  it('uses aef as the fixed route default and preserves a valid legacy query', async () => {
    const migrate = spyOn(service['migration'], 'migrate').and.callThrough();
    await RouterTestingHarness.create('/aef/list?v=11&cet=x');
    await flush();
    expect(migrate).toHaveBeenCalledWith('aef', { v: '11', cet: 'x' });
    expect(router.url).toBe('/aef/list?v=11&cet=x');
  });

  it('accepts the published v10 Endfield hash slot', async () => {
    const migration = observeMigration();
    const query = 'z=eJwrMzRQSwpUK0jUMgUAEqUDBw__&v=10';
    await RouterTestingHarness.create(`/list?${query}`);
    await migration.complete;
    expect(migration.spy.calls.mostRecent().returnValue.modId).toBe('aef');
    expect(router.url).toBe(`/aef/list?${query}`);
  });
});
