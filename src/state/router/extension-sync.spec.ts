import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  UrlTree,
} from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { ModData } from '~/data/schema/mod-data';
import { provideEndfieldStateExtension } from '~/endfield/adapters/state-extension';
import { encodeEndfield } from '~/endfield/compat/codec';
import { createEndfieldState, resourceOwner } from '~/endfield/domain/model';
import { provideEndfieldProduct } from '~/endfield/product/product';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import {
  PRESENTATION_EXTENSION,
  upstreamPresentation,
} from '~/extensions/presentation-extension';
import {
  cloneDefaults,
  EFFECTIVE_DEFAULTS,
  upstreamProduct,
} from '~/extensions/product-profile';
import {
  STATE_EXTENSION,
  StateExtension,
  upstreamState,
  WorkspaceRestoreError,
} from '~/extensions/state-extension';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { WorkspacePreparation } from '~/extensions/workspace-preparation';
import { rational } from '~/rational/rational';
import { ItemId } from '~/tests/item-id';
import { mockModData, mockModHash } from '~/tests/mocks/data';
import { TestModule } from '~/tests/test-module';

import { ObjectiveType } from '../objectives/objective-type';
import { ObjectiveUnit } from '../objectives/objective-unit';
import { initialSettingsState } from '../settings/settings-state';
import { initialTableState } from '../table/table-state';
import { LabParams } from './lab-params';
import { Params } from './params';
import { RouterSync, ZipState } from './router-sync';

describe('RouterSync extension and restoration boundary', () => {
  let service: RouterSync;
  let lifecycle: WorkspaceLifecycle;
  let extensionValue: ReturnType<typeof signal<string>>;
  let resources: BehaviorSubject<{
    modId: string | undefined;
    data: typeof mockModData | undefined;
    hash: typeof mockModHash | undefined;
    loading: boolean;
    error: unknown;
  }>;
  let route: { params: Subject<Params>; queryParams: Subject<Params> };
  let navigate: jasmine.Spy;

  beforeEach(() => {
    extensionValue = signal('initial');
    const extension: StateExtension = {
      ...upstreamState,
      strictImports: true,
      snapshot: () => extensionValue(),
      encode: (value) => ({ ef: value as string }),
      prepare: (input) => {
        if (input.params['ef'] === 'bad')
          throw new WorkspaceRestoreError([
            {
              code: 'ef',
              message: 'Invalid ef',
              field: 'ef',
              severity: 'error',
            },
          ]);
        return input;
      },
      decode: ({ state, plan }) => ({
        state,
        extension: plan.params['ef'] ?? 'initial',
        diagnostics: [],
      }),
      commit: (value) => {
        extensionValue.set(value as string);
      },
    };
    const defaults = cloneDefaults(upstreamProduct.defaults());
    defaults.settings.costs.surplus = rational.one;
    defaults.settings.costs.unproduceable = rational(1000000n);
    defaults.settings.costs.recycling = rational(1000n);
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        { provide: STATE_EXTENSION, useValue: extension },
        { provide: EFFECTIVE_DEFAULTS, useValue: defaults },
        {
          provide: PRESENTATION_EXTENSION,
          useValue: {
            ...upstreamPresentation,
            workspaceLink: (step: { id: string }): boolean =>
              step.id === 'derived',
          },
        },
      ],
    });
    service = TestBed.inject(RouterSync);
    lifecycle = TestBed.inject(WorkspaceLifecycle);
    resources = new BehaviorSubject<{
      modId: string | undefined;
      data: typeof mockModData | undefined;
      hash: typeof mockModHash | undefined;
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
    spyOn(TestBed.inject(ApplicationRef), 'tick');
    const router = TestBed.inject(Router);
    navigate = spyOn(router, 'navigate').and.resolveTo(true);
    spyOnProperty(router, 'url').and.returnValue('/2.0/list');
    route = { params: new Subject(), queryParams: new Subject() };
    service.route$.next(route as unknown as ActivatedRoute);
  });

  function open(params: Params, modId = '2.0'): void {
    route.params.next({ id: modId });
    route.queryParams.next(params);
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
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }

  it('encodes independent extension changes and caches the resulting URL', async () => {
    (TestBed.inject(ApplicationRef).tick as jasmine.Spy).and.callThrough();
    spyOn(service['settingsStore'], 'modHash').and.returnValue(mockModHash);
    spyOn(service, 'getHash').and.callFake((value) =>
      Promise.resolve(value.config.bare),
    );
    open({ v: '12', ef: 'one' });
    await flush();
    TestBed.tick();
    await flush();
    navigate.calls.reset();
    extensionValue.set('two');
    TestBed.tick();
    await flush();
    expect(navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ ef: 'two' }),
      }),
    );
    expect(service.stored()).toEqual('/2.0/list');
  });

  it('reports a synchronous encoding failure and accepts a later valid route', async () => {
    (TestBed.inject(ApplicationRef).tick as jasmine.Spy).and.callThrough();
    spyOn(service['settingsStore'], 'modHash').and.returnValue(mockModHash);
    service.stored.set('/2.0/list?preserved=1');
    open({ v: '12', ef: 'good', o: [ItemId.Wood] });
    await flush();
    const previous = service['objectivesStore'].state();
    const encode = spyOn(
      TestBed.inject(STATE_EXTENSION),
      'encode',
    ).and.throwError('encode failed');
    TestBed.tick();
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].message).toContain('encode failed');
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(service.stored()).toEqual('/2.0/list?preserved=1');
    expect(navigate).not.toHaveBeenCalled();
    encode.and.callThrough();
    route.queryParams.next({ v: '12', ef: 'after', o: [ItemId.Coal] });
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['objectivesStore'].state()['1'].targetId).toEqual(
      ItemId.Coal,
    );
  });

  it('reports asynchronous compression failure without overwriting the cached URL', async () => {
    (TestBed.inject(ApplicationRef).tick as jasmine.Spy).and.callThrough();
    spyOn(service['settingsStore'], 'modHash').and.returnValue(mockModHash);
    service.stored.set('/2.0/list?preserved=1');
    open({ v: '12', ef: 'good', o: [ItemId.Wood] });
    await flush();
    const previous = service['objectivesStore'].state();
    const compress = spyOn(service, 'getHash').and.rejectWith(
      new Error('compression failed'),
    );
    TestBed.tick();
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].message).toContain('compression failed');
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(service.stored()).toEqual('/2.0/list?preserved=1');
    expect(navigate).not.toHaveBeenCalled();
    compress.and.resolveTo({ v: '12' });
    route.queryParams.next({ v: '12', ef: 'after', o: [ItemId.Coal] });
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['objectivesStore'].state()['1'].targetId).toEqual(
      ItemId.Coal,
    );
  });

  it('ignores a stale compression rejection while a newer route is restoring', async () => {
    (TestBed.inject(ApplicationRef).tick as jasmine.Spy).and.callThrough();
    spyOn(service['settingsStore'], 'modHash').and.returnValue(mockModHash);
    service.stored.set('/2.0/list?preserved=1');
    open({ v: '12', ef: 'good', o: [ItemId.Wood] });
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
    expect(service.stored()).toEqual('/2.0/list?preserved=1');
    expect(navigate).not.toHaveBeenCalled();
    finishInflate('v=12&ef=after');
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(extensionValue()).toEqual('after');
  });

  it('prepares and commits direct public restore inputs when no plan was supplied', () => {
    const prepare = spyOn(
      TestBed.inject(STATE_EXTENSION),
      'prepare',
    ).and.callThrough();
    service.updateState(
      '2.0',
      { v: '12', o: [ItemId.Wood] },
      true,
      mockModData,
      mockModHash,
    );
    expect(prepare).toHaveBeenCalledWith({
      modId: '2.0',
      params: { v: '12', o: [ItemId.Wood] },
    });
    expect(service['objectivesStore'].state()['1'].targetId).toEqual(
      ItemId.Wood,
    );
    expect(service['ready']()).toBeTrue();
  });

  it('restores omitted cost settings from the effective product defaults', async () => {
    open({ v: '12', o: [ItemId.Wood] });
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    const costs = service['settingsStore'].state().costs;
    expect(costs.surplus).toEqual(rational.one);
    expect(costs.unproduceable).toEqual(rational(1000000n));
    expect(costs.recycling).toEqual(rational(1000n));
  });

  for (const [field, value] of [
    ['orm', 'yes'],
    ['omt', 'NaN'],
  ] as const) {
    it(`keeps the valid workspace when ${field} is malformed`, async () => {
      open({ v: '12', ef: 'good', o: [ItemId.Wood] });
      await flush();
      const previous = service['objectivesStore'].state();
      const previousSettings = service['settingsStore'].state();
      const stored = service.stored();
      route.queryParams.next({ v: '12', [field]: value });
      await flush();
      expect(lifecycle.ready()).toBeFalse();
      expect(lifecycle.diagnostics()[0].field).toEqual(field);
      expect(service['objectivesStore'].state()).toBe(previous);
      expect(service['settingsStore'].state()).toBe(previousSettings);
      expect(service.stored()).toEqual(stored);
      expect(navigate).not.toHaveBeenCalled();
      route.queryParams.next({ v: '12', ef: 'after', o: [ItemId.Coal] });
      await flush();
      expect(lifecycle.ready()).toBeTrue();
      expect(service['objectivesStore'].state()['1'].targetId).toEqual(
        ItemId.Coal,
      );
    });
  }

  it('does not commit a decode result carrying an error diagnostic', async () => {
    open({ v: '12', ef: 'good', o: [ItemId.Wood] });
    await flush();
    const previous = service['objectivesStore'].state();
    const stored = service.stored();
    const extension = TestBed.inject(STATE_EXTENSION);
    const originalDecode = extension.decode.bind(extension);
    spyOn(extension, 'decode').and.callFake((input) =>
      input.plan.params['ef'] === 'invalid'
        ? {
            state: input.state,
            extension: 'invalid',
            diagnostics: [
              {
                code: 'bad-decode',
                message: 'invalid state',
                field: 'ef',
                severity: 'error',
              },
            ],
          }
        : originalDecode(input),
    );
    route.queryParams.next({ v: '12', ef: 'invalid', o: [ItemId.Coal] });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].code).toEqual('bad-decode');
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(extensionValue()).toEqual('good');
    expect(service.stored()).toEqual(stored);
    expect(navigate).not.toHaveBeenCalled();
    route.queryParams.next({ v: '12', ef: 'after', o: [ItemId.Coal] });
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(extensionValue()).toEqual('after');
  });

  it('preserves the old workspace and can recover after invalid ef, z, or indices', async () => {
    spyOn(service, 'getHash').and.resolveTo({ v: '12' });
    open({ v: '12', ef: 'good', o: [ItemId.Wood] });
    await flush();
    const previous = service['objectivesStore'].state();
    const stored = service.stored();
    navigate.calls.reset();

    route.queryParams.next({ v: '12', ef: 'bad' });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].field).toEqual('ef');
    expect(extensionValue()).toEqual('good');
    expect(service['objectivesStore'].state()).toEqual(previous);
    expect(service.stored()).toEqual(stored);
    expect(navigate).not.toHaveBeenCalled();

    spyOn(service['compression'], 'inflate').and.rejectWith(new Error('bad z'));
    spyOn(console, 'error');
    route.queryParams.next({ v: '12', z: 'bad' });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].field).toEqual('z');
    expect(service['objectivesStore'].state()).toEqual(previous);
    expect(service.stored()).toEqual(stored);

    route.queryParams.next({ v: '12', r: ['wood**4'] });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].field).toEqual('4');
    expect(service['objectivesStore'].state()).toEqual(previous);
    expect(service.stored()).toEqual(stored);

    route.queryParams.next({ v: '12', ef: 'after' });
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(extensionValue()).toEqual('after');
  });

  it('ignores slow decompression after a newer navigation', async () => {
    let finish!: (value: string) => void;
    spyOn(service['compression'], 'inflate').and.returnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    open({ z: 'slow', v: '12' });
    route.queryParams.next({ ef: 'new', v: '12' });
    await flush();
    expect(extensionValue()).toEqual('new');
    finish('ef=old&v=12');
    await flush();
    expect(extensionValue()).toEqual('new');
    expect(lifecycle.ready()).toBeTrue();
  });

  it('preserves the outer version and uses the frozen hash from prepare', async () => {
    spyOn(service['compression'], 'inflate').and.resolveTo('v=11&o=A&ef=old');
    const extension = TestBed.inject(STATE_EXTENSION);
    const frozen = { ...mockModHash, items: ['frozen-item'] };
    const prepare = spyOn(extension, 'prepare').and.callFake((input) => ({
      ...input,
      hash: frozen,
    }));
    const decode = spyOn(extension, 'decode').and.callThrough();
    open({ z: 'compressed', v: '12' });
    await flush();
    expect(prepare).toHaveBeenCalledWith(
      jasmine.objectContaining({
        params: jasmine.objectContaining({ v: '12', z: 'compressed' }),
      }),
    );
    expect(decode.calls.mostRecent().args[0].hash).toBe(frozen);
    expect(service['objectivesStore'].state()['1'].targetId).toEqual(
      'frozen-item',
    );
  });

  it('preflights before preparing only requested objectives and committing', async () => {
    const extension = TestBed.inject(STATE_EXTENSION);
    const oldState = service['objectivesStore'].state();
    const order: string[] = [];
    spyOn(extension, 'preflight').and.callFake(() => {
      order.push('preflight');
      return ['1'];
    });
    spyOn(
      TestBed.inject(WorkspacePreparation),
      'prepareObjectives',
    ).and.callFake((_state, _data, _hash, ids) => {
      order.push('prepare');
      expect(ids).toEqual(['1']);
      expect(service['objectivesStore'].state()).toBe(oldState);
      return {};
    });
    const originalDecode = extension.decode.bind(extension);
    spyOn(extension, 'decode').and.callFake((input) => {
      order.push('decode');
      return originalDecode(input);
    });
    open({ v: '12', o: [ItemId.Wood, ItemId.Coal] });
    await flush();
    expect(order).toEqual(['preflight', 'prepare', 'decode']);
    expect(Object.keys(service['objectivesStore'].state())).toEqual(['1', '2']);
  });

  it('rolls back every committed store if extension commit throws', async () => {
    open({ v: '12', ef: 'good', o: [ItemId.Wood] });
    await flush();
    const previousObjectives = service['objectivesStore'].state();
    const previousSettings = service['settingsStore'].state();
    const stored = service.stored();
    const extension = TestBed.inject(STATE_EXTENSION);
    spyOn(extension, 'commit').and.callFake((value) => {
      extensionValue.set(value as string);
      if (value === 'throw') throw new Error('commit failed');
    });
    route.queryParams.next({ v: '12', ef: 'throw', o: [ItemId.Coal] });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].message).toContain('commit failed');
    expect(service['objectivesStore'].state()).toBe(previousObjectives);
    expect(service['settingsStore'].state()).toBe(previousSettings);
    expect(extensionValue()).toEqual('good');
    expect(service.stored()).toEqual(stored);
  });

  it('reports both a failed commit and a failed extension rollback', async () => {
    open({ v: '12', ef: 'good', o: [ItemId.Wood] });
    await flush();
    const previousObjectives = service['objectivesStore'].state();
    const previousSettings = service['settingsStore'].state();
    const stored = service.stored();
    let faulty = true;
    spyOn(TestBed.inject(STATE_EXTENSION), 'commit').and.callFake((value) => {
      if (faulty && value === 'throw') {
        extensionValue.set('partially committed');
        throw new Error('commit failed');
      }
      if (faulty) throw new Error('rollback failed');
      extensionValue.set(value as string);
    });
    route.queryParams.next({ v: '12', ef: 'throw', o: [ItemId.Coal] });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(
      lifecycle.diagnostics().map((diagnostic) => diagnostic.code),
    ).toEqual(['workspace-restore', 'workspace-rollback']);
    expect(lifecycle.diagnostics()[1].message).toContain('rollback failed');
    expect(service['objectivesStore'].state()).toBe(previousObjectives);
    expect(service['settingsStore'].state()).toBe(previousSettings);
    expect(extensionValue()).toEqual('partially committed');
    expect(service.stored()).toEqual(stored);
    expect(navigate).not.toHaveBeenCalled();
    faulty = false;
    route.queryParams.next({ v: '12', ef: 'after', o: [ItemId.Coal] });
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(extensionValue()).toEqual('after');
  });

  it('rejects an unknown legacy technology without dropping it and accepts an explicit empty set', async () => {
    open({ v: '12', ef: 'good', o: [ItemId.Wood] });
    await flush();
    const previous = service['objectivesStore'].state();
    route.queryParams.next({ v: '12', v10tre: 'retired-tech' });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0]).toEqual(
      jasmine.objectContaining({
        code: 'unknown-technology',
        field: 'v10tre',
        severity: 'error',
      }),
    );
    expect(service['objectivesStore'].state()).toBe(previous);
    route.queryParams.next({ v: '12', v10tre: ItemId.Wood });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].field).toEqual('v10tre');
    expect(service['objectivesStore'].state()).toBe(previous);
    route.queryParams.next({ v: '12', v10tre: ItemId.Electronics });
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(
      service['settingsStore']
        .state()
        .researchedTechnologyIds?.has(ItemId.Electronics),
    ).toBeTrue();
    route.queryParams.next({ v: '12', v10tre: '_' });
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['settingsStore'].state().researchedTechnologyIds).toEqual(
      new Set(),
    );
  });

  it('recovers from an interrupted resource stream on a new navigation', async () => {
    open({ v: '12', ef: 'good', o: [ItemId.Wood] });
    await flush();
    const previous = service['objectivesStore'].state();
    const previousSettings = service['settingsStore'].state();
    const stored = service.stored();
    open({ v: '12', ef: 'pending' }, '1.0');
    await flush();
    resources.error('resource stream disconnected');
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].message).toEqual(
      'resource stream disconnected',
    );
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(service['settingsStore'].state()).toBe(previousSettings);
    expect(service.stored()).toEqual(stored);
    resources = new BehaviorSubject<{
      modId: string | undefined;
      data: typeof mockModData | undefined;
      hash: typeof mockModHash | undefined;
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
    open({ v: '12', ef: 'after', o: [ItemId.Coal] });
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(extensionValue()).toEqual('after');
  });

  it('reports a resource failure lacking an error message and preserves the workspace', async () => {
    open({ v: '12', ef: 'good', o: [ItemId.Wood] });
    await flush();
    const previous = service['objectivesStore'].state();
    open({ v: '12', ef: 'pending' }, '1.0');
    await flush();
    resources.error({ status: 503 });
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].message).toEqual(
      'Workspace restoration failed',
    );
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('waits for matching resources and cancels the older resource wait', async () => {
    open({ ef: 'old', v: '12' }, '1.0');
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    open({ ef: 'new', v: '12' }, '1.1');
    await flush();
    resources.next({
      modId: '1.0',
      data: mockModData,
      hash: mockModHash,
      loading: false,
      error: undefined,
    });
    expect(lifecycle.ready()).toBeFalse();
    expect(extensionValue()).toEqual('initial');
    resources.next({
      modId: '1.1',
      data: mockModData,
      hash: mockModHash,
      loading: true,
      error: undefined,
    });
    expect(lifecycle.ready()).toBeFalse();
    resources.next({
      modId: '1.1',
      data: mockModData,
      hash: mockModHash,
      loading: false,
      error: undefined,
    });
    expect(lifecycle.ready()).toBeTrue();
    expect(extensionValue()).toEqual('new');
  });

  it('restores the previous settings after a fatal resource failure', async () => {
    open({ ef: 'good', v: '12', o: [ItemId.Wood] });
    await flush();
    const previousSettings = service['settingsStore'].state();
    const previousObjectives = service['objectivesStore'].state();
    open({ ef: 'new', v: '12' }, '1.0');
    await flush();
    resources.next({
      modId: '1.0',
      data: undefined,
      hash: undefined,
      loading: false,
      error: new Error('data failed'),
    });
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].message).toContain('data failed');
    expect(service['settingsStore'].state()).toBe(previousSettings);
    expect(service['objectivesStore'].state()).toBe(previousObjectives);
    expect(extensionValue()).toEqual('good');
  });

  it('does not navigate or save when an older compression finishes last', async () => {
    open({ ef: 'ready', v: '12' });
    await flush();
    let finishOld!: (value: LabParams) => void;
    let finishNew!: (value: LabParams) => void;
    const getHash = spyOn(service, 'getHash');
    getHash.and.returnValues(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
      new Promise((resolve) => {
        finishNew = resolve;
      }),
    );
    void service.updateUrl(emptyZip(), service['activeTicket']);
    void service.updateUrl(emptyZip(), service['activeTicket']);
    finishNew({ ef: 'new' } as LabParams);
    await flush();
    finishOld({ ef: 'old' } as LabParams);
    await flush();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.calls.mostRecent().args[1].queryParams).toEqual({
      ef: 'new',
    });
    expect(service.stored()).toEqual('/2.0/list');
  });

  it('discards a pending write when a new external navigation begins', async () => {
    open({ ef: 'ready', v: '12' });
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
    expect(service.stored()).toEqual(stored);
  });

  it('uses effective defaults when writing values equal to upstream defaults', () => {
    const zip = emptyZip();
    service.zipSettings(
      zip,
      initialSettingsState,
      [],
      service['settingsStore'].dataset(),
      mockModHash,
    );
    expect(zip.config.bare.csu).toEqual('0');
    expect(zip.config.bare.cun).toEqual('100000000');
    expect(zip.config.bare.cre).toEqual('1');
  });

  it('keeps ordinary objectives and extension config for derived links', async () => {
    service['objectivesStore'].set({
      1: {
        id: '1',
        targetId: ItemId.Wood,
        value: rational.one,
        unit: ObjectiveUnit.Items,
        type: ObjectiveType.Output,
      },
      2: {
        id: '2',
        targetId: ItemId.Coal,
        value: rational.one,
        unit: ObjectiveUnit.Items,
        type: ObjectiveType.Output,
      },
    });
    spyOn(service['settingsStore'], 'modHash').and.returnValue(mockModHash);
    spyOn(service, 'getHash').and.callFake((value) =>
      Promise.resolve({
        ...value.objectives.bare,
        ...value.config.bare,
      }),
    );
    const config = {
      bare: { ef: 'settings', och: 'B' },
      hash: { ef: 'settings', och: 'B' },
    };
    const derived = await service.stepHref(
      { id: 'derived', itemId: ItemId.Coal, items: rational(5n) },
      config,
    );
    expect(derived?.o).toEqual([ItemId.Wood, ItemId.Coal]);
    expect((derived as Params)['ef']).toEqual('settings');
    expect(derived?.och).toEqual('B');
    const ordinary = await service.stepHref(
      { id: 'ordinary', itemId: ItemId.Coal, items: rational(5n) },
      config,
    );
    expect(ordinary?.o).toEqual([`${ItemId.Coal}*5`]);
    expect((ordinary as Params)['ef']).toEqual('settings');
    expect(ordinary?.och).toBeUndefined();
    expect(config.bare.och).toEqual('B');
    expect(config.hash.och).toEqual('B');
  });
});

describe('RouterSync real Endfield legacy restoration', () => {
  for (const [section, id, field] of [
    ['i', 'retired-item', 'items.retired-item'],
    ['r', 'retired-recipe', 'recipes.retired-recipe'],
    ['m', 'retired-machine', 'machines.retired-machine'],
  ] as const) {
    it(`reports an unknown ${section} record even when it has no settings`, async () => {
      TestBed.configureTestingModule({
        imports: [TestModule],
        providers: [
          provideEndfieldProduct(),
          ...provideEndfieldStateExtension(),
        ],
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
        providers: [
          provideEndfieldProduct(),
          ...provideEndfieldStateExtension(),
        ],
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
      endfield.toggleDerived(resourceOwner('copper_ore'), true);
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
        providers: [
          provideEndfieldProduct(),
          ...provideEndfieldStateExtension(),
        ],
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
    const defaults = cloneDefaults(upstreamProduct.defaults());
    defaults.extension = createEndfieldState();
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        { provide: EFFECTIVE_DEFAULTS, useValue: defaults },
        ...provideEndfieldStateExtension(),
        {
          provide: PRESENTATION_EXTENSION,
          useValue: {
            ...upstreamPresentation,
            workspaceLink: (step: { id: string }): boolean =>
              step.id === 'derived',
          },
        },
      ],
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
    const prepared = service['settingsStore'].prepareState(
      settings,
      data,
      rawHash,
    );
    const zipped = service.zipState({
      objectives,
      items: {},
      recipes: {},
      machines: {},
      settings,
      table: initialTableState,
      data: prepared.data,
      hash: rawHash,
      extension: TestBed.inject(STATE_EXTENSION).snapshot(),
    });
    expect(zipped.config.bare.och).toEqual('B');
    const ordinary = await service.stepHref(
      { id: 'ordinary', itemId: 'xiranite_powder', items: rational(5n) },
      zipped.config,
    );
    const derived = await service.stepHref(
      { id: 'derived', itemId: 'carbon_enr', items: rational(5n) },
      zipped.config,
    );
    expect(ordinary).not.toBeNull();
    expect(derived).not.toBeNull();
    const extension = TestBed.inject(STATE_EXTENSION);
    async function restore(params: LabParams): Promise<void> {
      const input = await service.unzipQueryParams(params as Params);
      const plan = extension.prepare({ modId: 'aef', params: input });
      const migrated = service['migration'].migrate(
        plan.modId,
        plan.params,
        plan.legacyModHashes,
      );
      service.updateState(
        migrated.modId,
        migrated.params,
        migrated.isBare,
        data,
        rawHash,
        plan,
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
    const defaults = cloneDefaults(upstreamProduct.defaults());
    defaults.extension = createEndfieldState();
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        { provide: EFFECTIVE_DEFAULTS, useValue: defaults },
        ...provideEndfieldStateExtension(),
      ],
    });
    const service = TestBed.inject(RouterSync);
    const data = rawData as unknown as ModData;
    const prepared = service['settingsStore'].prepareState(
      { modId: 'aef' },
      data,
      rawHash,
    );
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
      prepared.data,
      rawHash,
    );
    expect(zip.config.bare.rex).toEqual('A*C');
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
    const extension = TestBed.inject(STATE_EXTENSION);
    const oldState = service.unzipSettings(
      'aef',
      { rex: 'A~C' },
      [],
      [],
      data,
      rawHash,
    );
    expect(() =>
      extension.preflight({
        state: { settingsState: oldState },
        plan: extension.prepare({
          modId: 'aef',
          params: { v: '12', rex: 'A~C' },
        }),
        data,
      }),
    ).toThrowError(WorkspaceRestoreError);
  });

  it('prepares a legacy resource objective, then separates its checks from ordinary objectives', async () => {
    const defaults = cloneDefaults(upstreamProduct.defaults());
    defaults.extension = createEndfieldState();
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        { provide: EFFECTIVE_DEFAULTS, useValue: defaults },
        ...provideEndfieldStateExtension(),
      ],
    });
    const service = TestBed.inject(RouterSync);
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    const endfield = TestBed.inject(EndfieldStore);
    const prepare = spyOn(
      TestBed.inject(WorkspacePreparation),
      'prepareObjectives',
    ).and.callThrough();
    spyOn(TestBed.inject(ApplicationRef), 'tick');
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
      v: '11',
      o: ['xiranite_powder*2', 'copper_ore-liquid_water*28*3*12*miner_4'],
      och: 'B',
      cet: '3/2',
    });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(lifecycle.diagnostics())
      .withContext(JSON.stringify(lifecycle.diagnostics()))
      .toEqual([]);
    expect(lifecycle.ready()).toBeTrue();
    expect(prepare.calls.mostRecent().args[3]).toEqual(['2']);
    expect(
      Object.values(service['objectivesStore'].state()).map(
        (objective) => objective.targetId,
      ),
    ).toEqual(['xiranite_powder']);
    expect(service['settingsStore'].state().checkedObjectiveIds.size).toEqual(
      0,
    );
    expect(
      endfield.state().checkedDerived.has(resourceOwner('copper_ore')),
    ).toBeTrue();
    expect(
      endfield.state().resourceLimits.rates.copper_ore.gt(rational.zero),
    ).toBeTrue();
    expect(
      endfield.state().resourceRecipeSettings.copper_ore?.machineId,
    ).toEqual('miner_4');
    expect(endfield.state().electric).toEqual(rational(3n, 2n));
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
        provideEndfieldProduct(),
        ...provideEndfieldStateExtension(),
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
    await attach('v=12&o=xiranite_powder*5');
    expect(lifecycle.ready()).toBeTrue();
    const previous = service['objectivesStore'].state();
    const previousSettings = service['settingsStore'].state();
    const previousExtension = TestBed.inject(EndfieldStore).state();
    const next = service['state'].next as jasmine.Spy;
    TestBed.tick();
    next.calls.reset();
    for (const page of ['flow', 'data', 'list']) {
      expect(
        await router.navigateByUrl(`/aef/${page}?v=12&o=xiranite_powder*5`),
      ).toBeTrue();
      await flush();
      expect(lifecycle.ready()).toBeTrue();
      expect(service['ready']()).toBeTrue();
      expect(service['objectivesStore'].state()).toBe(previous);
      expect(service['settingsStore'].state()).toBe(previousSettings);
      expect(TestBed.inject(EndfieldStore).state()).toEqual(previousExtension);
      expect(lifecycle.originalInput()).toEqual(
        `/aef/${page}?v=12&o=xiranite_powder*5`,
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
    for (const resolve of pending.slice(0, -1)) resolve(`v=12&o=${token}*2`);
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    pending[pending.length - 1](`v=12&o=${token}*5`);
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['objectivesStore'].state()['1'].value).toEqual(rational(5n));
    expect(lifecycle.originalInput()).toEqual('/aef/flow?z=slow&v=12');
  });

  it('preserves a failed restore and its diagnostic on a child page navigation', async () => {
    await attach('v=12&o=xiranite_powder*5');
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

  it('reports a snapshot failure during navigation and recovers on a later route', async () => {
    const previous = service['objectivesStore'].state();
    const snapshot = spyOn(
      TestBed.inject(STATE_EXTENSION),
      'snapshot',
    ).and.throwError('snapshot failed');
    expect(await router.navigateByUrl('/2.0/next?v=12')).toBeTrue();
    await flush();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].message).toContain('snapshot failed');
    expect(service['objectivesStore'].state()).toBe(previous);
    snapshot.and.callThrough();
    expect(await router.navigateByUrl('/2.0/next?v=12&o=wood')).toBeTrue();
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['objectivesStore'].state()['1'].targetId).toEqual('wood');
  });

  it('reports a failed rollback on guard cancellation and permits a later navigation', async () => {
    const previous = service['objectivesStore'].state();
    let failing = true;
    spyOn(TestBed.inject(STATE_EXTENSION), 'commit').and.callFake(() => {
      if (failing) {
        failing = false;
        throw new Error('rollback failed');
      }
    });
    guard = (): boolean => false;
    expect(await router.navigateByUrl('/2.0/cancel?v=12')).toBeFalse();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].message).toContain('rollback failed');
    expect(service['objectivesStore'].state()).toBe(previous);
    guard = (): boolean => true;
    expect(await router.navigateByUrl('/2.0/next?v=12&o=wood')).toBeTrue();
    await flush();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['objectivesStore'].state()['1'].targetId).toEqual('wood');
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

  it('reports a snapshot rollback error on exit without writing to the editor', async () => {
    const saved = service.stored();
    const previous = service['objectivesStore'].state();
    let failing = true;
    spyOn(TestBed.inject(STATE_EXTENSION), 'commit').and.callFake(() => {
      if (failing) {
        failing = false;
        throw new Error('exit rollback failed');
      }
    });
    expect(await router.navigateByUrl('/editor/items?tab=one')).toBeTrue();
    TestBed.tick();
    await flush();
    expect(router.url).toEqual('/editor/items?tab=one');
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()[0].message).toContain(
      'exit rollback failed',
    );
    expect(service['objectivesStore'].state()).toBe(previous);
    expect(service.stored()).toEqual(saved);
    expect(navigate).not.toHaveBeenCalled();
    expect(await router.navigateByUrl('/2.0/list?v=12&o=wood*3')).toBeTrue();
    await attachWorkspace();
    expect(lifecycle.ready()).toBeTrue();
    expect(service['objectivesStore'].state()['1'].value).toEqual(rational(3n));
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
