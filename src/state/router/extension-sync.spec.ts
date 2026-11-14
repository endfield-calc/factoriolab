import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  UrlTree,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { Id } from '~/app/id/id';
import { ModData } from '~/data/schema/mod-data';
import { encodeEndfield } from '~/endfield/compat/codec';
import {
  createEndfieldState,
  resourceObjectiveId,
} from '~/endfield/domain/model';
import { provideEndfieldDefaults } from '~/endfield/product/product';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import {
  cloneDefaults,
  EFFECTIVE_DEFAULTS,
  initialDefaults,
  PINNED_MOD_ID,
} from '~/extensions/defaults';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { rational } from '~/rational/rational';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { mockModData, mockModHash } from '~/tests/mocks/data';
import { TestModule } from '~/tests/test-module';

import { ObjectiveType } from '../objectives/objective-type';
import { ObjectiveUnit } from '../objectives/objective-unit';
import { initialTableState } from '../table/table-state';
import { Compression } from './compression';
import { LabParams } from './lab-params';
import { Params } from './params';
import { RouterSync, ZipState } from './router-sync';

describe('RouterSync current Endfield restoration and writes', () => {
  let service: RouterSync;
  let lifecycle: WorkspaceLifecycle;
  let endfield: EndfieldStore;
  let route: { params: Subject<Params>; queryParams: Subject<Params> };
  let navigate: jasmine.Spy;
  let resources: BehaviorSubject<{
    modId: string | undefined;
    data: ModData | undefined;
    hash: typeof rawHash | undefined;
    loading: boolean;
    error: unknown;
  }>;
  const data = rawData as unknown as ModData;
  const encoded = (electric: number): string =>
    encodeEndfield({ ...createEndfieldState(), electric: rational(electric) });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    const settings = TestBed.inject(SettingsStore);
    settings.apply({ modId: 'aef' });
    settings['modDataResource'].set(data);
    settings['modHashResource'].set(rawHash);
    endfield = TestBed.inject(EndfieldStore);
    service = TestBed.inject(RouterSync);
    lifecycle = TestBed.inject(WorkspaceLifecycle);
    resources = new BehaviorSubject<(typeof resources)['value']>({
      modId: 'aef',
      data,
      hash: rawHash,
      loading: false,
      error: undefined,
    });
    (service as any).resources = resources;
    const router = TestBed.inject(Router);
    navigate = spyOn(router, 'navigate').and.resolveTo(true);
    spyOnProperty(router, 'url').and.returnValue('/aef/list');
    route = { params: new Subject(), queryParams: new Subject() };
    service.route$.next(route as unknown as ActivatedRoute);
  });

  function open(query: Params): void {
    route.params.next({ id: 'aef' });
    route.queryParams.next(query);
  }
  function emptyZip(): ZipState {
    return {
      objectives: service.empty,
      config: service.empty,
      objectiveSettings: service.emptyMachineSettings,
      recipeSettings: service.emptyMachineSettings,
      machineSettings: service.emptyMachineSettings,
    };
  }
  async function flush(): Promise<void> {
    for (let i = 0; i < 15; i++) await Promise.resolve();
  }

  it('encodes changes from the real EndfieldStore and caches the resulting URL', async () => {
    spyOn(service, 'getHash').and.callFake((value) =>
      Promise.resolve(value.config.bare),
    );
    open({ v: '12', ef: encoded(2) });
    await flush();
    TestBed.tick();
    await flush();
    navigate.calls.reset();
    endfield.set({ ...endfield.snapshot(), electric: rational(3) });
    TestBed.tick();
    await flush();
    expect(navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ ef: encoded(3) }),
      }),
    );
    expect(service.stored()).toEqual('/aef/list');
  });

  it('blocks URL writeback if a live objective is absent from the current hash', async () => {
    spyOn(service, 'getHash').and.resolveTo({ v: '12' });
    open({ v: '12', ef: encoded(2), o: ['xiranite_powder*5'] });
    await flush();
    TestBed.tick();
    await flush();
    service.stored.set('/aef/list?preserved=1');
    navigate.calls.reset();
    const objective = service['objectivesStore'].state()['1'];
    service['objectivesStore'].set({
      1: { ...objective, targetId: 'retired-item' },
    });
    TestBed.tick();
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].field).toEqual('retired-item');
    expect(endfield.state().electric).toEqual(rational(2));
    expect(service.stored()).toEqual('/aef/list?preserved=1');
    expect(navigate).not.toHaveBeenCalled();
  });

  for (const [failure, message] of [
    ['compression unavailable', 'compression unavailable'],
    [{}, 'Workspace restoration failed'],
  ] as const) {
    it(`preserves the URL when a resource stream fails: ${message}`, async () => {
      open({ v: '12', ef: encoded(2), o: ['xiranite_powder*5'] });
      await flush();
      TestBed.tick();
      await flush();
      service.stored.set('/aef/list?preserved=1');
      navigate.calls.reset();
      resources.next({
        modId: 'aef',
        data: undefined,
        hash: undefined,
        loading: true,
        error: undefined,
      });
      route.queryParams.next({ v: '12', ef: encoded(3) });
      await flush();
      resources.error(failure);
      await flush();
      expect(lifecycle.ready()).toBeFalse();
      expect(lifecycle.diagnostics()[0].message).toEqual(message);
      expect(service.stored()).toEqual('/aef/list?preserved=1');
      expect(navigate).not.toHaveBeenCalled();
    });
  }

  it('discards a candidate carrying an obsolete generation', () => {
    const previous = service['objectivesStore'].state();
    const stale = lifecycle.begin('/aef/list?old');
    lifecycle.begin('/aef/list?new');
    service.updateState(
      'aef',
      { v: '12', o: ['xiranite_powder*5'], ef: encoded(2) } as LabParams,
      true,
      data,
      rawHash,
      stale,
    );
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(endfield.state().electric).toEqual(rational.one);
  });

  for (const [failure, message] of [
    [new Error('rollback failed'), 'rollback failed'],
    [{}, 'Failed to restore the previous workspace'],
  ] as const) {
    it(`reports a rollback failure: ${message}`, async () => {
      open({ v: '12', ef: encoded(2), o: ['xiranite_powder*5'] });
      await flush();
      const previous = service['objectivesStore'].state();
      const set = spyOn(endfield, 'set').and.throwError(failure as Error);
      route.queryParams.next({ v: '12', ef: 'bad' });
      await flush();
      expect(lifecycle.ready()).toBeFalse();
      expect(lifecycle.diagnostics()[1].code).toBe('workspace-rollback');
      expect(lifecycle.diagnostics()[1].message).toBe(message);
      expect(service['objectivesStore'].state()).toBe(previous);
      set.and.callThrough();
      route.queryParams.next({ v: '12', ef: encoded(3) });
      await flush();
      expect(lifecycle.ready()).toBeTrue();
      expect(endfield.state().electric).toEqual(rational(3));
    });
  }

  it('preserves the workspace on invalid ef, compression and indices, then recovers', async () => {
    spyOn(service, 'getHash').and.resolveTo({ v: '12' });
    open({ v: '12', ef: encoded(2), o: ['xiranite_powder*5'] });
    await flush();
    const previous = service['objectivesStore'].state();
    const stored = service.stored();
    navigate.calls.reset();
    route.queryParams.next({ v: '12', ef: 'bad' });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].field).toEqual('ef');
    expect(endfield.state().electric).toEqual(rational(2));
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(service.stored()).toEqual(stored);
    expect(navigate).not.toHaveBeenCalled();
    spyOn(service['compression'], 'inflate').and.rejectWith(new Error('bad z'));
    spyOn(console, 'error');
    route.queryParams.next({ v: '12', z: 'bad' });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].field).toEqual('z');
    expect(service['objectivesStore'].state()).toBe(previous);
    route.queryParams.next({ v: '12', r: ['originium_ore**4'] });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(endfield.state().electric).toEqual(rational(2));
    route.queryParams.next({ v: '12', ef: encoded(3) });
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(endfield.state().electric).toEqual(rational(3));
  });

  it('ignores a late inflate after a newer route restores real ef', async () => {
    let finish!: (value: string) => void;
    spyOn(service['compression'], 'inflate').and.returnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    open({ z: 'slow', v: '12' });
    route.queryParams.next({ ef: encoded(3), v: '12' });
    await flush();
    expect(endfield.state().electric).toEqual(rational(3));
    finish(`ef=${encoded(2)}&v=12`);
    await flush();
    expect(endfield.state().electric).toEqual(rational(3));
    expect(lifecycle.ready()).toBeTrue();
  });

  it('preserves the outer version while restoring from the current hash', async () => {
    spyOn(service['compression'], 'inflate').and.resolveTo(
      `v=11&o=A&ef=${encoded(2)}`,
    );
    const migrate = spyOn(service['migration'], 'migrate').and.callThrough();
    open({ z: 'compressed', v: '12' });
    await flush();
    expect(migrate).toHaveBeenCalledWith(
      'aef',
      jasmine.objectContaining({ v: '12', z: 'compressed' }),
    );
    expect(lifecycle.ready()).toBeTrue();
    expect(service['objectivesStore'].state()['1'].targetId).toEqual(
      rawHash.items[0]!,
    );
    expect(endfield.state().electric).toEqual(rational(2));
  });

  it('ignores stale compression rejection while a later route is inflating', async () => {
    service.stored.set('/aef/list?preserved=1');
    open({ v: '12', ef: encoded(2), o: ['xiranite_powder*5'] });
    await flush();
    let rejectWrite!: (error: Error) => void;
    spyOn(service, 'getHash').and.returnValue(
      new Promise((_resolve, reject) => {
        rejectWrite = reject;
      }),
    );
    let finishInflate!: (value: string) => void;
    spyOn(service['compression'], 'inflate').and.returnValue(
      new Promise((resolve) => {
        finishInflate = resolve;
      }),
    );
    TestBed.tick();
    await flush();
    route.queryParams.next({ v: '12', z: 'slow' });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    rejectWrite(new Error('obsolete write'));
    await flush();
    expect(lifecycle.diagnostics()).toEqual([]);
    expect(service.stored()).toEqual('/aef/list?preserved=1');
    expect(navigate).not.toHaveBeenCalled();
    finishInflate(`v=12&ef=${encoded(3)}`);
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(endfield.state().electric).toEqual(rational(3));
  });

  it('publishes only the latest compression result', async () => {
    open({ ef: encoded(2), v: '12' });
    await flush();
    let finishOld!: (value: LabParams) => void;
    let finishNew!: (value: LabParams) => void;
    spyOn(service, 'getHash').and.returnValues(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
      new Promise((resolve) => {
        finishNew = resolve;
      }),
    );
    void service.updateUrl(emptyZip(), service['activeTicket']);
    void service.updateUrl(emptyZip(), service['activeTicket']);
    finishNew({ ef: encoded(3) } as LabParams);
    await flush();
    finishOld({ ef: encoded(2) } as LabParams);
    await flush();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.calls.mostRecent().args[1].queryParams).toEqual({
      ef: encoded(3),
    });
    expect(service.stored()).toEqual('/aef/list');
  });

  it('discards a pending write when a new external route fails', async () => {
    open({ ef: encoded(2), v: '12' });
    await flush();
    const stored = service.stored();
    let finish!: (value: LabParams) => void;
    spyOn(service, 'getHash').and.returnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    void service.updateUrl(emptyZip(), service['activeTicket']);
    route.queryParams.next({ ef: 'bad', v: '12' });
    await flush();
    finish({ v: '12' });
    await flush();
    expect(navigate).not.toHaveBeenCalled();
    expect(endfield.state().electric).toEqual(rational(2));
    expect(service.stored()).toEqual(stored);
  });

  it('does not commit until the matching resources finish loading', async () => {
    resources.next({
      modId: 'aef',
      data: undefined,
      hash: undefined,
      loading: true,
      error: undefined,
    });
    open({ ef: encoded(2), v: '12' });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    route.queryParams.next({ ef: encoded(3), v: '12' });
    await flush();
    resources.next({
      modId: '1.0',
      data,
      hash: rawHash,
      loading: false,
      error: undefined,
    });
    expect(lifecycle.ready()).toBeFalse();
    expect(endfield.state().electric).toEqual(rational.one);
    resources.next({
      modId: 'aef',
      data,
      hash: rawHash,
      loading: false,
      error: undefined,
    });
    expect(lifecycle.ready()).toBeTrue();
    expect(endfield.state().electric).toEqual(rational(3));
  });
});

describe('RouterSync real Endfield restoration', () => {
  for (const [section, id, field] of [
    ['i', 'retired-item', 'items.retired-item'],
    ['r', 'retired-recipe', 'recipes.retired-recipe'],
    ['m', 'retired-machine', 'machines.retired-machine'],
  ] as const) {
    it(`reports an unknown ${section} record even when it has no settings`, async () => {
      TestBed.configureTestingModule({
        imports: [TestModule],
        providers: [...provideEndfieldDefaults()],
      });
      const service = TestBed.inject(RouterSync);
      const lifecycle = TestBed.inject(WorkspaceLifecycle);
      const router = TestBed.inject(Router);
      const navigate = spyOn(router, 'navigate').and.resolveTo(true);
      let url = '/aef/list?v=12&o=xiranite_powder*5';
      spyOnProperty(router, 'url').and.callFake(() => url);
      service['settingsStore'].apply({ modId: 'aef' });
      (service as any).resources = new BehaviorSubject({
        modId: 'aef',
        data: rawData as unknown as ModData,
        hash: rawHash,
        loading: false,
        error: undefined,
      });
      const params = new Subject<Params>();
      const queryParams = new Subject<Params>();
      service.route$.next({ params, queryParams } as unknown as ActivatedRoute);
      params.next({ id: 'aef' });
      queryParams.next({ v: '12', o: ['xiranite_powder*5'] });
      for (let i = 0; i < 15; i++) await Promise.resolve();
      const previous = service['objectivesStore'].state();
      service.stored.set(url);
      url = `/aef/list?v=12&${section}=${id}`;
      queryParams.next({ v: '12', [section]: [id] });
      for (let i = 0; i < 15; i++) await Promise.resolve();
      expect(lifecycle.ready()).toBeFalse();
      expect(lifecycle.diagnostics()[0].field).toEqual(field);
      expect(service['objectivesStore'].state()).toBe(previous);
      expect(lifecycle.originalInput()).toEqual(url);
      expect(service.stored()).toEqual('/aef/list?v=12&o=xiranite_powder*5');
      expect(navigate).not.toHaveBeenCalled();
      url = '/aef/list?v=12&o=xiranite_powder*2';
      queryParams.next({ v: '12', o: ['xiranite_powder*2'] });
      for (let i = 0; i < 15; i++) await Promise.resolve();
      expect(lifecycle.ready()).toBeTrue();
      expect(service['objectivesStore'].state()['1'].value).toEqual(
        rational(2n),
      );
    });
  }

  for (const target of ['resource', 'global'] as const) {
    it(`preserves the existing workspace for invalid ${target} overclock`, async () => {
      TestBed.configureTestingModule({
        imports: [TestModule],
        providers: [...provideEndfieldDefaults()],
      });
      const service = TestBed.inject(RouterSync);
      const lifecycle = TestBed.inject(WorkspaceLifecycle);
      const endfield = TestBed.inject(EndfieldStore);
      service['settingsStore'].apply({ modId: 'aef' });
      service['objectivesStore'].set({
        '1': {
          id: '1',
          targetId: 'xiranite_powder',
          value: rational(7n),
          unit: ObjectiveUnit.Items,
          type: ObjectiveType.Output,
        },
      });
      service['itemsStore'].set({ xiranite_powder: { stack: rational(5n) } });
      service['recipesStore'].set({ originium_ore: { cost: rational(2n) } });
      service['machinesStore'].set({ miner_4: { overclock: rational.one } });
      service['tableStore'].apply({ filter: 'original' });
      endfield.setResourceChecked('copper_ore', true);
      const previous = {
        settings: service['settingsStore'].state(),
        objectives: service['objectivesStore'].state(),
        items: service['itemsStore'].state(),
        recipes: service['recipesStore'].state(),
        machines: service['machinesStore'].state(),
        table: service['tableStore'].state(),
        extension: endfield.state(),
      };
      const initial = createEndfieldState();
      const ef = encodeEndfield({
        ...initial,
        resourceLimits: {
          enabled: true,
          rates: {
            ...initial.resourceLimits.rates,
            originium_ore: rational.one,
          },
        },
        resourceRecipeSettings: { originium_ore: { overclock: rational.zero } },
      });
      const query: Params =
        target === 'resource'
          ? { v: '12', ef, o: ['xiranite_powder*2'] }
          : { v: '12', moc: '0', o: ['xiranite_powder*2'] };
      const url = `/aef/list?v=12&${target === 'resource' ? `ef=${ef}` : 'moc=0'}`;
      const router = TestBed.inject(Router);
      spyOnProperty(router, 'url').and.returnValue(url);
      const navigate = spyOn(router, 'navigate').and.resolveTo(true);
      service.stored.set('/aef/list?v=12');
      (service as any).resources = new BehaviorSubject({
        modId: 'aef',
        data: rawData as unknown as ModData,
        hash: rawHash,
        loading: false,
        error: undefined,
      });
      const params = new Subject<Params>();
      const queryParams = new Subject<Params>();
      service.route$.next({ params, queryParams } as unknown as ActivatedRoute);
      params.next({ id: 'aef' });
      queryParams.next(query);
      for (let i = 0; i < 15; i++) await Promise.resolve();
      expect(lifecycle.ready()).toBeFalse();
      expect(
        lifecycle
          .diagnostics()
          .some((diagnostic) => diagnostic.field?.includes('overclock')),
      ).toBeTrue();
      expect(service['settingsStore'].state()).toBe(previous.settings);
      expect(service['objectivesStore'].state()).toBe(previous.objectives);
      expect(service['itemsStore'].state()).toBe(previous.items);
      expect(service['recipesStore'].state()).toBe(previous.recipes);
      expect(service['machinesStore'].state()).toBe(previous.machines);
      expect(service['tableStore'].state()).toBe(previous.table);
      expect(endfield.state()).toEqual(previous.extension);
      expect(lifecycle.originalInput()).toEqual(url);
      expect(service.stored()).toEqual('/aef/list?v=12');
      expect(navigate).not.toHaveBeenCalled();
    });
  }

  for (const compressed of [false, true]) {
    it(`rejects a migrated disallowed mod from a ${compressed ? 'compressed' : 'bare'} legacy link`, async () => {
      TestBed.configureTestingModule({
        imports: [TestModule],
        providers: [...provideEndfieldDefaults()],
      });
      const service = TestBed.inject(RouterSync);
      const lifecycle = TestBed.inject(WorkspaceLifecycle);
      const settings = service['settingsStore'];
      settings.apply({ modId: 'aef' });
      const previousSettings = settings.state();
      const previousObjectives = service['objectivesStore'].state();
      const previousExtension = TestBed.inject(EndfieldStore).state();
      service.stored.set('/aef/list?v=12');
      const router = TestBed.inject(Router);
      const url = compressed ? '/aef/list?v=10&z=old' : '/aef/list?v=10&b=1.1';
      spyOnProperty(router, 'url').and.returnValue(url);
      const navigate = spyOn(router, 'navigate').and.resolveTo(true);
      if (compressed)
        spyOn(service['compression'], 'inflate').and.resolveTo('v=10&b=A');
      const params = new Subject<Params>();
      const queryParams = new Subject<Params>();
      service.route$.next({ params, queryParams } as unknown as ActivatedRoute);
      params.next({ id: 'aef' });
      queryParams.next(
        compressed ? { v: '10', z: 'old' } : { v: '10', b: '1.1' },
      );
      for (let i = 0; i < 15; i++) await Promise.resolve();
      expect(lifecycle.ready()).toBeFalse();
      expect(lifecycle.diagnostics()[0]?.code).toEqual('mod-not-allowed');
      expect(lifecycle.diagnostics()[0]?.message).toContain('1.1');
      expect(lifecycle.originalInput()).toEqual(url);
      expect(settings.state()).toBe(previousSettings);
      expect(service['objectivesStore'].state()).toBe(previousObjectives);
      expect(TestBed.inject(EndfieldStore).state()).toEqual(previousExtension);
      expect(service.stored()).toEqual('/aef/list?v=12');
      expect(navigate).not.toHaveBeenCalled();
      expect(router.url).toEqual(url);
    });
  }

  it('allows an upstream mod when no product allowlist is configured', async () => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    const service = TestBed.inject(RouterSync);
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    spyOn(service['appRef'], 'tick');
    (service as any).resources = new BehaviorSubject({
      modId: '1.1',
      data: mockModData,
      hash: mockModHash,
      loading: false,
      error: undefined,
    });
    const params = new Subject<Params>();
    const queryParams = new Subject<Params>();
    service.route$.next({ params, queryParams } as unknown as ActivatedRoute);
    params.next({ id: '2.0' });
    queryParams.next({ v: '10', b: '1.1' });
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['settingsStore'].modId()).toEqual('1.1');
  });

  it('round trips ordinary and derived links with multiple checked objectives', async () => {
    const defaults = cloneDefaults(initialDefaults);
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [{ provide: EFFECTIVE_DEFAULTS, useValue: defaults }],
    });
    const service = TestBed.inject(RouterSync);
    const data = rawData as unknown as ModData;
    const settings = {
      ...defaults.settings,
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
    service['objectivesStore'].set(objectives);
    service['settingsStore'].set(settings);
    spyOn(service['settingsStore'], 'modHash').and.returnValue(rawHash);
    service['settingsStore']['modDataResource'].set(data);
    service['settingsStore']['modHashResource'].set(rawHash);
    const zipped = service.zipState({
      objectives,
      items: {},
      recipes: {},
      machines: {},
      settings,
      table: initialTableState,
      data: service['settingsStore'].dataset(),
      hash: rawHash,
      endfield: TestBed.inject(EndfieldStore).snapshot(),
    });
    expect(zipped.config.bare.och).toEqual('B');
    const ordinary = await service.stepHref(
      { id: 'ordinary', itemId: 'xiranite_powder', items: rational(5n) },
      zipped.config,
    );
    const derived = await service.stepHref(
      {
        id: 'derived',
        recipeObjectiveId: resourceObjectiveId('originium_ore'),
        itemId: 'carbon_enr',
        items: rational(5n),
      },
      zipped.config,
    );
    expect(ordinary).not.toBeNull();
    expect(derived).not.toBeNull();
    async function restore(params: LabParams): Promise<void> {
      const input = await service.unzipQueryParams(params as Params);
      const migrated = service['migration'].migrate('aef', input);
      service.updateState(
        migrated.modId,
        migrated.params,
        migrated.isBare,
        data,
        rawHash,
      );
    }
    await restore(ordinary!);
    expect(Object.keys(service['objectivesStore'].state())).toEqual(['1']);
    expect(service['objectivesStore'].state()['1'].value).toEqual(rational(5n));
    expect(service['settingsStore'].state().checkedObjectiveIds.size).toEqual(
      0,
    );
    await restore(derived!);
    expect(Object.keys(service['objectivesStore'].state())).toEqual(['1', '2']);
    expect(service['settingsStore'].state().checkedObjectiveIds).toEqual(
      new Set(['2']),
    );
    expect(zipped.config.bare.och).toEqual('B');
    expect(zipped.config.hash.och).toEqual('B');
  });

  it('round trips real multi-item and multi-recipe subsets around retired slots', () => {
    const defaults = cloneDefaults(initialDefaults);
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [{ provide: EFFECTIVE_DEFAULTS, useValue: defaults }],
    });
    const service = TestBed.inject(RouterSync);
    const data = rawData as unknown as ModData;
    service['settingsStore'].apply({ modId: 'aef' });
    service['settingsStore']['modDataResource'].set(data);
    service['settingsStore']['modHashResource'].set(rawHash);
    const zip: ZipState = {
      objectives: service.empty,
      config: service.empty,
      objectiveSettings: service.emptyMachineSettings,
      recipeSettings: service.emptyMachineSettings,
      machineSettings: service.emptyMachineSettings,
    };
    const excludedRecipeIds = new Set([
      'carbon_enr',
      'carbon_mtl-plant_moss_1',
    ]);
    const checkedItemIds = new Set([
      'pipe',
      'iron_bottle-liquid_plant_grass_1',
    ]);
    service.zipSettings(
      zip,
      { ...defaults.settings, excludedRecipeIds, checkedItemIds },
      [],
      service['settingsStore'].dataset(),
      rawHash,
    );
    expect(zip.config.bare.rex).toEqual('A~C');
    const restored = service.unzipSettings(
      'aef',
      zip.config.bare,
      [],
      [],
      data,
      rawHash,
    );
    expect(restored?.excludedRecipeIds).toEqual(excludedRecipeIds);
    expect(restored?.checkedItemIds).toEqual(checkedItemIds);
  });

  it('keeps unsupported objective types and cet under native semantics', async () => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [...provideEndfieldDefaults()],
    });
    const service = TestBed.inject(RouterSync);
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    const endfield = TestBed.inject(EndfieldStore);
    service['settingsStore'].apply({ modId: 'aef' });
    (service as any).resources = new BehaviorSubject({
      modId: 'aef',
      data: rawData as unknown as ModData,
      hash: rawHash,
      loading: false,
      error: undefined,
    });
    const params = new Subject<Params>();
    const queryParams = new Subject<Params>();
    service.route$.next({ params, queryParams } as unknown as ActivatedRoute);
    params.next({ id: 'aef' });
    queryParams.next({
      v: '12',
      o: [
        'xiranite_powder*2',
        'originium_ore*2*3*11',
        'originium_ore*3*3*12',
        'xiranite_oven_1*4*0*13',
        'xiranite_powder*1*0*14',
      ],
      och: 'B~D',
      cet: 'invalid',
    });
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(lifecycle.ready()).toBeTrue();
    expect(lifecycle.diagnostics()).toEqual([]);
    expect(
      Object.values(service['objectivesStore'].state()).map(
        (objective): number => objective.type,
      ),
    ).toEqual([0, 11, 12, 13, 14]);
    expect(service['settingsStore'].state().checkedObjectiveIds).toEqual(
      new Set(['2', '3', '4']),
    );
    expect(encodeEndfield(endfield.snapshot())).toEqual(
      encodeEndfield(createEndfieldState()),
    );
  });
});

@Component({ template: '' })
class NavigationFixture {}

describe('RouterSync parent ActivatedRoute with child pages', () => {
  let service: RouterSync;
  let lifecycle: WorkspaceLifecycle;
  let router: Router;
  let resources: BehaviorSubject<{
    modId: string;
    data: ModData;
    hash: typeof rawHash;
    loading: boolean;
    error: unknown;
  }>;

  async function flush(): Promise<void> {
    for (let i = 0; i < 15; i++) await Promise.resolve();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        ...provideEndfieldDefaults(),
        provideRouter([
          {
            path: ':id',
            component: NavigationFixture,
            children: [
              { path: 'list', component: NavigationFixture },
              { path: 'flow', component: NavigationFixture },
              { path: 'data', component: NavigationFixture },
            ],
          },
        ]),
      ],
    });
    service = TestBed.inject(RouterSync);
    lifecycle = TestBed.inject(WorkspaceLifecycle);
    router = TestBed.inject(Router);
    resources = new BehaviorSubject<{
      modId: string;
      data: ModData;
      hash: typeof rawHash;
      loading: boolean;
      error: unknown;
    }>({
      modId: 'aef',
      data: rawData as unknown as ModData,
      hash: rawHash,
      loading: false,
      error: undefined,
    });
    (service as any).resources = resources;
    service['settingsStore'].apply({ modId: 'aef' });
    spyOn(service['settingsStore'], 'modData').and.returnValue(
      rawData as unknown as ModData,
    );
    spyOn(service['settingsStore'], 'modHash').and.returnValue(rawHash);
    spyOn(service['state'], 'next');
  });

  async function attach(query: string): Promise<void> {
    expect(await router.navigateByUrl(`/aef/list?${query}`)).toBeTrue();
    const parent = router.routerState.root.firstChild;
    if (parent == null) throw new Error('Missing parent ActivatedRoute');
    service.route$.next(parent);
    await flush();
  }

  it('keeps the existing workspace ready through list, flow and data child routes', async () => {
    const ef = encodeEndfield({
      ...createEndfieldState(),
      electric: rational(2),
    });
    await attach(`v=12&o=xiranite_powder*5&ef=${ef}`);
    expect(lifecycle.ready()).toBeTrue();
    const previous = service['objectivesStore'].state();
    const previousSettings = service['settingsStore'].state();
    const previousExtension = TestBed.inject(EndfieldStore).state();
    const next = service['state'].next as jasmine.Spy;
    TestBed.tick();
    next.calls.reset();
    for (const page of ['flow', 'data', 'list']) {
      expect(
        await router.navigateByUrl(
          `/aef/${page}?v=12&o=xiranite_powder*5&ef=${ef}`,
        ),
      ).toBeTrue();
      await flush();
      expect(lifecycle.ready()).toBeTrue();
      expect(service['ready']()).toBeTrue();
      expect(service['objectivesStore'].state()).toBe(previous);
      expect(service['settingsStore'].state()).toBe(previousSettings);
      expect(TestBed.inject(EndfieldStore).state()).toEqual(previousExtension);
      expect(lifecycle.originalInput()).toEqual(
        `/aef/${page}?v=12&o=xiranite_powder*5&ef=${ef}`,
      );
      TestBed.tick();
      expect(next).toHaveBeenCalled();
      next.calls.reset();
    }
  });

  it('restarts an unfinished restore after a child page navigation', async () => {
    const pending: ((value: string) => void)[] = [];
    const inflate = spyOn(service['compression'], 'inflate').and.callFake(
      (): Promise<string> =>
        new Promise<string>((resolve) => {
          pending.push(resolve);
        }),
    );
    await attach('z=slow&v=12');
    expect(lifecycle.ready()).toBeFalse();
    const originalCalls = inflate.calls.count();
    expect(await router.navigateByUrl('/aef/flow?z=slow&v=12')).toBeTrue();
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(inflate.calls.count()).toBeGreaterThan(originalCalls);
    const token = service['zip'].zipNString('xiranite_powder', rawHash.items);
    const encoded = (electric: number): string =>
      encodeEndfield({
        ...createEndfieldState(),
        electric: rational(electric),
      });
    for (const resolve of pending.slice(0, -1))
      resolve(`v=12&o=${token}*2&ef=${encoded(2)}`);
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    pending[pending.length - 1](`v=12&o=${token}*5&ef=${encoded(3)}`);
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['objectivesStore'].state()['1'].value).toEqual(rational(5n));
    expect(TestBed.inject(EndfieldStore).state().electric).toEqual(rational(3));
    expect(lifecycle.originalInput()).toEqual('/aef/flow?z=slow&v=12');
  });

  it('preserves a failed restore and its diagnostic on a child page navigation', async () => {
    const ef = encodeEndfield({
      ...createEndfieldState(),
      electric: rational(2),
    });
    await attach(`v=12&o=xiranite_powder*5&ef=${ef}`);
    const previous = service['objectivesStore'].state();
    expect(await router.navigateByUrl('/aef/list?v=12&ef=bad')).toBeTrue();
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    const diagnostics = lifecycle.diagnostics();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(await router.navigateByUrl('/aef/flow?v=12&ef=bad')).toBeTrue();
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(service['ready']()).toBeFalse();
    expect(lifecycle.diagnostics()).toEqual(diagnostics);
    expect(lifecycle.originalInput()).toEqual('/aef/flow?v=12&ef=bad');
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(TestBed.inject(EndfieldStore).state().electric).toEqual(rational(2));
  });
});

describe('RouterSync real Router navigation timing', () => {
  let service: RouterSync;
  let lifecycle: WorkspaceLifecycle;
  let router: Router;
  let guard: (
    route: ActivatedRouteSnapshot,
  ) => boolean | UrlTree | Promise<boolean | UrlTree>;
  let navigate: jasmine.Spy;
  let resources: BehaviorSubject<{
    modId: string;
    data: typeof mockModData;
    hash: typeof mockModHash;
    loading: boolean;
    error: unknown;
  }>;

  async function flush(): Promise<void> {
    for (let i = 0; i < 15; i++) await Promise.resolve();
  }

  function emptyZip(): ZipState {
    return {
      objectives: service.empty,
      config: service.empty,
      objectiveSettings: service.emptyMachineSettings,
      recipeSettings: service.emptyMachineSettings,
      machineSettings: service.emptyMachineSettings,
    };
  }

  beforeEach(async () => {
    guard = (): boolean => true;
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        provideRouter([
          {
            path: ':id/:view',
            component: NavigationFixture,
            canActivate: [
              (route): boolean | UrlTree | Promise<boolean | UrlTree> =>
                guard(route),
            ],
            runGuardsAndResolvers: 'always',
          },
        ]),
      ],
    });
    service = TestBed.inject(RouterSync);
    lifecycle = TestBed.inject(WorkspaceLifecycle);
    router = TestBed.inject(Router);
    resources = new BehaviorSubject<{
      modId: string;
      data: typeof mockModData;
      hash: typeof mockModHash;
      loading: boolean;
      error: unknown;
    }>({
      modId: '2.0',
      data: mockModData,
      hash: mockModHash,
      loading: false,
      error: undefined,
    });
    (service as any).resources = resources;
    spyOn(service['settingsStore'], 'modHash').and.returnValue(mockModHash);
    spyOn(service['state'], 'next');
    navigate = spyOn(router, 'navigate').and.callThrough();
    await router.navigateByUrl('/2.0/start?v=12');
    const route = router.routerState.root.firstChild;
    if (route == null) throw new Error('Missing activated route');
    service.route$.next(route);
    await flush();
    expect(lifecycle.ready()).toBeTrue();
  });

  it('blocks an old compression while a real guard holds the new navigation', async () => {
    let finishHash!: (params: LabParams) => void;
    spyOn(service, 'getHash').and.returnValue(
      new Promise((resolve) => {
        finishHash = resolve;
      }),
    );
    const oldWrite = service.updateUrl(emptyZip(), service['activeTicket']);
    let releaseGuard!: (value: boolean) => void;
    guard = (): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        releaseGuard = resolve;
      });
    const external = router.navigateByUrl('/2.0/guarded?v=12');
    await flush();
    expect(service['navigationPending']()).toBeTrue();
    expect(lifecycle.ready()).toBeFalse();
    finishHash({ v: '12' });
    await oldWrite;
    expect(navigate).not.toHaveBeenCalled();
    expect(router.url).toEqual('/2.0/start?v=12');
    releaseGuard(true);
    expect(await external).toBeTrue();
    await flush();
    expect(router.url).toEqual('/2.0/guarded?v=12');
    expect(service['navigationPending']()).toBeFalse();
    expect(lifecycle.ready()).toBeTrue();
  });

  it('rolls back and becomes ready when the real guard cancels', async () => {
    const previous = service['settingsStore'].state();
    let releaseGuard!: (value: boolean) => void;
    guard = (): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        releaseGuard = resolve;
      });
    const external = router.navigateByUrl('/2.0/cancel?v=12');
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    releaseGuard(false);
    expect(await external).toBeFalse();
    expect(router.url).toEqual('/2.0/start?v=12');
    expect(service['settingsStore'].state()).toBe(previous);
    expect(service['navigationPending']()).toBeFalse();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['ready']()).toBeTrue();
  });

  it('reports a failed store rollback when a real guard cancels', async () => {
    const previous = service['objectivesStore'].state();
    const set = spyOn(TestBed.inject(EndfieldStore), 'set').and.throwError(
      'rollback failed',
    );
    guard = (): boolean => false;
    expect(await router.navigateByUrl('/2.0/cancel?v=12')).toBeFalse();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].message).toContain('rollback failed');
    expect(service['objectivesStore'].state()).toBe(previous);
    set.and.callThrough();
    guard = (): boolean => true;
    expect(await router.navigateByUrl('/2.0/next?v=12&o=wood')).toBeTrue();
    await flush();
    expect(lifecycle.ready()).toBeTrue();
  });

  it('keeps the gate through a redirect and restores on guard error', async () => {
    guard = (route): boolean | UrlTree =>
      route.params['view'] === 'redirect'
        ? router.parseUrl('/2.0/target?v=12')
        : true;
    expect(await router.navigateByUrl('/2.0/redirect?v=12')).toBeTrue();
    await flush();
    expect(router.url).toEqual('/2.0/target?v=12');
    expect(service['navigationPending']()).toBeFalse();
    expect(lifecycle.ready()).toBeTrue();

    guard = (): never => {
      throw new Error('guard failed');
    };
    await expectAsync(
      router.navigateByUrl('/2.0/error?v=12'),
    ).toBeRejectedWithError('guard failed');
    expect(router.url).toEqual('/2.0/target?v=12');
    expect(service['navigationPending']()).toBeFalse();
    expect(lifecycle.ready()).toBeTrue();
  });

  it('releases the gate when a redirect to the current URL is skipped', async () => {
    guard = (route): boolean | UrlTree =>
      route.params['view'] === 'redirect'
        ? router.parseUrl('/2.0/start?v=12')
        : true;
    await router.navigateByUrl('/2.0/redirect?v=12');
    await flush();
    expect(router.url).toEqual('/2.0/start?v=12');
    expect(service['navigationPending']()).toBeFalse();
    expect(lifecycle.ready()).toBeTrue();
  });

  it('does not block its own sync navigation', async () => {
    const begin = spyOn(lifecycle, 'begin').and.callThrough();
    spyOn(service, 'getHash').and.resolveTo({ v: '12', tpg: '2' });
    await service.updateUrl(emptyZip(), service['activeTicket']);
    expect(navigate).toHaveBeenCalled();
    expect(begin).not.toHaveBeenCalled();
    expect(service['navigationPending']()).toBeFalse();
    expect(lifecycle.ready()).toBeTrue();
    expect(router.url).toContain('tpg=2');
  });

  it('does not migrate or apply a stale unzip after a new navigation starts', async () => {
    let finish!: (value: string) => void;
    const inflate = spyOn(service['compression'], 'inflate').and.callFake(
      (): Promise<string> =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    expect(await router.navigateByUrl('/1.0/load?z=slow&v=12')).toBeTrue();
    await flush();
    const originalInflates = inflate.calls.count();
    const migrate = spyOn(service['migration'], 'migrate').and.callThrough();
    const apply = spyOn(service['settingsStore'], 'apply').and.callThrough();
    let releaseGuard!: (value: boolean) => void;
    guard = (): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        releaseGuard = resolve;
      });
    const external = router.navigateByUrl('/2.0/guarded?v=12');
    await flush();
    finish('v=12');
    await flush();
    expect(migrate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    spyOn(service['appRef'], 'tick');
    releaseGuard(false);
    expect(await external).toBeFalse();
    await flush();
    expect(inflate.calls.count()).toBeGreaterThan(originalInflates);
    finish('v=12');
    await flush();
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ modId: '1.0' });
    resources.next({
      modId: '1.0',
      data: mockModData,
      hash: mockModHash,
      loading: false,
      error: undefined,
    });
    expect(lifecycle.ready()).toBeTrue();
    expect(router.url).toEqual('/1.0/load?z=slow&v=12');
  });
});

describe('RouterSync leaving the workspace route tree', () => {
  let service: RouterSync;
  let lifecycle: WorkspaceLifecycle;
  let router: Router;
  let navigate: jasmine.Spy;

  async function flush(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }

  async function attachWorkspace(): Promise<void> {
    const parent = router.routerState.root.firstChild;
    if (parent == null) throw new Error('Missing workspace parent');
    service.route$.next(parent);
    await flush();
    TestBed.tick();
    await flush();
    const last = navigate.calls.mostRecent();
    if (last != null) await (last.returnValue as Promise<boolean>);
    await flush();
  }

  async function changeObjective(value: bigint): Promise<void> {
    const objective = service['objectivesStore'].state()['1'];
    service['objectivesStore'].set({
      '1': { ...objective, value: rational(value) },
    });
    const previousCalls = navigate.calls.count();
    TestBed.tick();
    await flush();
    expect(navigate.calls.count()).toBeGreaterThan(previousCalls);
    await (navigate.calls.mostRecent().returnValue as Promise<boolean>);
    await flush();
  }

  beforeEach(async () => {
    localStorage.removeItem('router');
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        provideRouter([
          {
            path: 'editor',
            children: [{ path: 'items', component: NavigationFixture }],
          },
          { path: 'error', component: NavigationFixture },
          {
            path: ':id',
            component: NavigationFixture,
            children: [
              { path: 'list', component: NavigationFixture },
              { path: 'flow', component: NavigationFixture },
            ],
          },
        ]),
      ],
    });
    service = TestBed.inject(RouterSync);
    lifecycle = TestBed.inject(WorkspaceLifecycle);
    router = TestBed.inject(Router);
    (service as any).resources = new BehaviorSubject({
      modId: '2.0',
      data: mockModData,
      hash: mockModHash,
      loading: false,
      error: undefined,
    });
    spyOn(service['settingsStore'], 'modData').and.returnValue(mockModData);
    spyOn(service['settingsStore'], 'modHash').and.returnValue(mockModHash);
    spyOn(service, 'getHash').and.callFake((value) =>
      Promise.resolve({
        ...value.objectives.bare,
        ...value.config.bare,
        v: '12',
      }),
    );
    navigate = spyOn(router, 'navigate').and.callThrough();
    expect(await router.navigateByUrl('/2.0/list?v=12&o=wood*2')).toBeTrue();
    await attachWorkspace();
    expect(lifecycle.ready()).toBeTrue();
    await changeObjective(6n);
    expect(service.stored()).toEqual(router.url);
    expect(navigate).toHaveBeenCalled();
    navigate.calls.reset();
  });

  afterEach(() => {
    localStorage.removeItem('router');
  });

  it('keeps editor and error URLs untouched and reactivates URL sync on return', async () => {
    const saved = service.stored();
    const previous = service['objectivesStore'].state();
    const settings = service['settingsStore'].state();
    expect(await router.navigateByUrl('/editor/items?tab=one')).toBeTrue();
    await flush();
    TestBed.tick();
    await flush();
    expect(router.url).toEqual('/editor/items?tab=one');
    expect(service.stored()).toEqual(saved);
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(service['settingsStore'].state()).toBe(settings);
    expect(lifecycle.ready()).toBeFalse();
    expect(navigate).not.toHaveBeenCalled();

    expect(await router.navigateByUrl('/editor/items?tab=two')).toBeTrue();
    await flush();
    TestBed.tick();
    await flush();
    expect(router.url).toEqual('/editor/items?tab=two');
    expect(service.stored()).toEqual(saved);
    expect(navigate).not.toHaveBeenCalled();

    expect(await router.navigateByUrl('/error?reason=bad')).toBeTrue();
    await flush();
    TestBed.tick();
    await flush();
    expect(router.url).toEqual('/error?reason=bad');
    expect(service.stored()).toEqual(saved);
    expect(navigate).not.toHaveBeenCalled();

    expect(await router.navigateByUrl('/2.0/list?v=12&o=wood*3')).toBeTrue();
    await attachWorkspace();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['objectivesStore'].state()['1'].value).toEqual(rational(3n));
    expect(router.url).toContain('/2.0/list');
    await changeObjective(8n);
    expect(service.stored()).toEqual(router.url);
    expect(navigate).toHaveBeenCalled();
  });

  it('discards an older compression after leaving the route tree', async () => {
    const saved = service.stored();
    let finish!: (params: LabParams) => void;
    (service.getHash as jasmine.Spy).and.returnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const oldWrite = service.updateUrl(
      {
        objectives: service.empty,
        config: service.empty,
        objectiveSettings: service.emptyMachineSettings,
        recipeSettings: service.emptyMachineSettings,
        machineSettings: service.emptyMachineSettings,
      },
      service['activeTicket'],
    );
    expect(await router.navigateByUrl('/editor/items?tab=one')).toBeTrue();
    finish({ v: '12' });
    await oldWrite;
    TestBed.tick();
    await flush();
    expect(router.url).toEqual('/editor/items?tab=one');
    expect(service.stored()).toEqual(saved);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('reports a failed store rollback when leaving the workspace', async () => {
    const saved = service.stored();
    const set = spyOn(TestBed.inject(EndfieldStore), 'set').and.throwError(
      'exit rollback failed',
    );
    expect(await router.navigateByUrl('/editor/items?tab=one')).toBeTrue();
    TestBed.tick();
    await flush();
    expect(router.url).toEqual('/editor/items?tab=one');
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].message).toContain(
      'exit rollback failed',
    );
    expect(service.stored()).toEqual(saved);
    expect(navigate).not.toHaveBeenCalled();
    set.and.callThrough();
    expect(await router.navigateByUrl('/2.0/list?v=12&o=wood*3')).toBeTrue();
    await attachWorkspace();
    expect(lifecycle.ready()).toBeTrue();
  });

  it('discards an older inflate when leaving and restores a later workspace', async () => {
    const saved = service.stored();
    const previous = service['objectivesStore'].state();
    let finish!: (value: string) => void;
    spyOn(service['compression'], 'inflate').and.returnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    expect(await router.navigateByUrl('/2.0/list?z=slow&v=12')).toBeTrue();
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(await router.navigateByUrl('/editor/items?tab=one')).toBeTrue();
    finish('v=12&o=A*9');
    await flush();
    TestBed.tick();
    await flush();
    expect(router.url).toEqual('/editor/items?tab=one');
    expect(service.stored()).toEqual(saved);
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(lifecycle.ready()).toBeFalse();
    expect(navigate).not.toHaveBeenCalled();
    expect(await router.navigateByUrl('/2.0/list?v=12&o=wood*4')).toBeTrue();
    await attachWorkspace();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['objectivesStore'].state()['1'].value).toEqual(rational(4n));
    await changeObjective(5n);
    expect(service.stored()).toEqual(router.url);
  });
});

/** Fault injection: these hooks deliberately violate the extension purity contract. */
describe('RouterSync public retry and product boundaries', () => {
  let router: Router;
  let service: RouterSync;
  let lifecycle: WorkspaceLifecycle;
  let settings: SettingsStore;
  let objectives: ObjectivesStore;
  const loading = signal(false);
  const loadError = signal<Error | undefined>(undefined);

  async function flush(): Promise<void> {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  }

  beforeEach(async () => {
    loading.set(false);
    loadError.set(undefined);
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        {
          provide: PINNED_MOD_ID,
          useValue: '2.0',
        },
        provideRouter([
          {
            path: ':id',
            component: Id,
            children: [{ path: 'list', component: NavigationFixture }],
          },
        ]),
      ],
    });
    settings = TestBed.inject(SettingsStore);
    spyOn(settings, 'modData').and.returnValue(mockModData);
    spyOn(settings, 'modHash').and.returnValue(mockModHash);
    spyOn(settings, 'loading').and.callFake(loading);
    spyOn(settings, 'loadError').and.callFake(loadError);
    objectives = TestBed.inject(ObjectivesStore);
    lifecycle = TestBed.inject(WorkspaceLifecycle);
    router = TestBed.inject(Router);
    service = TestBed.inject(RouterSync);
    spyOn(service, 'getHash').and.callFake((value) =>
      Promise.resolve({
        ...value.objectives.bare,
        ...value.config.bare,
        v: '12',
      }),
    );
    await RouterTestingHarness.create('/2.0/list?v=12&o=wood*2');
    for (let i = 0; i < 8; i++) {
      TestBed.tick();
      await Promise.resolve();
    }
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(objectives.state()['1'].value).toEqual(rational(2n));
  });

  it('waits for current resources when retry is unavailable and a cached snapshot is stale', async () => {
    // Simulate a resource adapter declining a reload while another request is
    // already loading; its public signals change before the queued effect runs.
    const retry = spyOn(settings, 'retryFailedResources').and.returnValue(
      false,
    );
    const compression = TestBed.inject(Compression);
    let finishInflate: ((value: string) => void) | undefined;
    spyOn(compression, 'inflate').and.callFake(
      () =>
        new Promise<string>((resolve) => {
          finishInflate = resolve;
        }),
    );
    const previous = objectives.state();
    const stored = service.stored();
    const navigate = spyOn(router, 'navigate').and.callThrough();
    const url = '/2.0/list?v=12&z=slow';
    expect(await router.navigateByUrl(url)).toBeTrue();
    await flush();
    expect(finishInflate).toBeDefined();
    const error = new Error('data request failed');
    loadError.set(error);
    loading.set(true);
    const token = compression.nToId(mockModHash.items.indexOf('wood'));
    finishInflate?.(`v=12&o=${token}*8`);
    await flush();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(lifecycle.ready()).toBeFalse();
    expect(objectives.state()).toBe(previous);
    expect(service.stored()).toEqual(stored);
    expect(navigate).not.toHaveBeenCalled();
    TestBed.tick();
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()).toEqual([]);
    expect(objectives.state()).toBe(previous);
    loadError.set(undefined);
    loading.set(false);
    TestBed.tick();
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(lifecycle.diagnostics()).toEqual([]);
    expect(objectives.state()['1'].targetId).toEqual('wood');
    expect(objectives.state()['1'].value).toEqual(rational(8n));
  });
});
