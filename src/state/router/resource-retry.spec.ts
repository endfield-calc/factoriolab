import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import rawI18n from '/public/data/aef/i18n/zh.json';
import { emptyModData } from '~/data/schema/mod-data';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { rational } from '~/rational/rational';
import { ItemsStore } from '~/state/items/items-store';
import { MachinesStore } from '~/state/machines/machines-store';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { TableStore } from '~/state/table/table-store';
import { WorkspaceLifecycle } from '~/state/workspace-lifecycle';
import { mockModHash } from '~/tests/mocks/data';
import { TestModule } from '~/tests/test-module';

import { Params } from './params';
import { RouterSync } from './router-sync';

describe('RouterSync resource retry with the real Endfield HTTP resources', () => {
  const dataUrl = 'data/aef/data.json';
  const hashUrl = 'data/aef/hash.json';
  const i18nUrl = 'data/aef/i18n/zh.json';
  const savedUrl = '/aef/list?v=12&o=xiranite_powder*5';
  const badAttemptUrl = '/aef/list?v=12&o=xiranite_powder*3';
  const retryUrl = '/aef/list?v=12&o=xiranite_powder*2';
  let http: HttpTestingController;
  let settings: SettingsStore;
  let preferences: PreferencesStore;
  let objectives: ObjectivesStore;
  let endfield: EndfieldStore;
  let items: ItemsStore;
  let machines: MachinesStore;
  let recipes: RecipesStore;
  let table: TableStore;
  let oldItems: ReturnType<ItemsStore['state']>;
  let oldMachines: ReturnType<MachinesStore['state']>;
  let oldRecipes: ReturnType<RecipesStore['state']>;
  let oldTable: ReturnType<TableStore['state']>;
  let lifecycle: WorkspaceLifecycle;
  let service: RouterSync;
  let params: Subject<Params>;
  let queryParams: Subject<Params>;
  let navigate: jasmine.Spy;
  let currentUrl: string;

  async function settle(): Promise<void> {
    for (let i = 0; i < 8; i++) {
      TestBed.tick();
      await Promise.resolve();
    }
  }

  function answer(
    request: TestRequest,
    failure?: string | readonly string[],
  ): void {
    const failed =
      typeof failure === 'string'
        ? request.request.url === failure
        : failure?.includes(request.request.url);
    if (failed) {
      request.flush('temporarily unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      });
    } else if (request.request.url === dataUrl) request.flush(rawData);
    else if (request.request.url === hashUrl) request.flush(rawHash);
    else if (request.request.url === i18nUrl) request.flush(rawI18n);
    else fail(`Unexpected aef request: ${request.request.url}`);
  }

  function answerAefRequests(
    label: string,
    failure?: string | readonly string[],
  ): string[] {
    const requests = http.match((request) =>
      request.url.startsWith('data/aef/'),
    );
    const urls = requests.map((request) => request.request.url);
    console.info(`[resource-retry] ${label}: ${JSON.stringify(urls)}`);
    requests.forEach((request) => {
      answer(request, failure);
    });
    return urls;
  }

  function attachRouter(): void {
    oldItems = items.state();
    oldMachines = machines.state();
    oldRecipes = recipes.state();
    oldTable = table.state();
    service = TestBed.inject(RouterSync);
    lifecycle = TestBed.inject(WorkspaceLifecycle);
    const router = TestBed.inject(Router);
    navigate = spyOn(router, 'navigate').and.resolveTo(true);
    spyOnProperty(router, 'url', 'get').and.callFake(() => currentUrl);
    params = new Subject<Params>();
    queryParams = new Subject<Params>();
    service.route$.next({ params, queryParams } as unknown as ActivatedRoute);
  }

  function open(url: string, value: string, first = false): void {
    currentUrl = url;
    if (first) params.next({ id: 'aef' });
    queryParams.next({ v: '12', o: [`xiranite_powder*${value}`] });
  }

  function expectPreserved(
    oldSettings: ReturnType<SettingsStore['state']>,
    oldObjectives: ReturnType<ObjectivesStore['state']>,
    oldExtension: ReturnType<EndfieldStore['state']>,
  ): void {
    expect(settings.state()).toBe(oldSettings);
    expect(objectives.state()).toBe(oldObjectives);
    expect(endfield.state()).toEqual(oldExtension);
    expect(items.state()).toBe(oldItems);
    expect(machines.state()).toBe(oldMachines);
    expect(recipes.state()).toBe(oldRecipes);
    expect(table.state()).toBe(oldTable);
    expect(service.stored()).toBe(savedUrl);
    expect(localStorage.getItem('router')).toBe(savedUrl);
    expect(preferences.states()['aef']['preserved']).toBe(savedUrl);
    expect(
      JSON.parse(localStorage.getItem('preferences')!).states.aef.preserved,
    ).toBe(savedUrl);
    expect(navigate).not.toHaveBeenCalled();
  }

  function expectRecovered(value = 2n): void {
    expect(lifecycle.ready())
      .withContext(JSON.stringify(lifecycle.errors()))
      .toBeTrue();
    expect(settings.loadError()).toBeUndefined();
    const objective = objectives.state()['1'];
    expect(objective?.targetId).toBe('xiranite_powder');
    expect(objective?.value.eq(rational(value))).toBeTrue();
  }

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('router', savedUrl);
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        // TestModule otherwise supplies a mock resource-backed SettingsStore.
        { provide: SettingsStore, useClass: SettingsStore },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    settings = TestBed.inject(SettingsStore);
    preferences = TestBed.inject(PreferencesStore);
    preferences.apply({ language: 'zh' });
    objectives = TestBed.inject(ObjectivesStore);
    endfield = TestBed.inject(EndfieldStore);
    items = TestBed.inject(ItemsStore);
    machines = TestBed.inject(MachinesStore);
    recipes = TestBed.inject(RecipesStore);
    table = TestBed.inject(TableStore);
    preferences.saveState('aef', 'preserved', savedUrl);
    objectives.set({
      '1': {
        id: '1',
        targetId: 'xiranite_powder',
        value: rational(5n),
        unit: ObjectiveUnit.Items,
        type: ObjectiveType.Output,
      },
    });
    items.set({ xiranite_powder: { stack: rational(5n) } });
    machines.set({ miner_4: { overclock: rational.one } });
    recipes.set({ 'copper_ore-liquid_water': { cost: rational(2n) } });
    table.apply({ filter: 'xiranite' });
    endfield.setResourceChecked('copper_ore', true);
    currentUrl = savedUrl;
    await settle();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('rejects a foreign route before requesting its resources or changing any store', async () => {
    attachRouter();
    const oldSettings = settings.state();
    const oldObjectives = objectives.state();
    const oldExtension = endfield.state();
    const url = '/1.1/list?v=12';
    currentUrl = url;
    params.next({ id: '1.1' });
    queryParams.next({ v: '12' });
    await settle();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.errors()).toEqual(['Workspace mod is not available: 1.1']);
    expect(lifecycle.originalInput()).toBe(url);
    expectPreserved(oldSettings, oldObjectives, oldExtension);
    http.expectNone((request) => request.url.startsWith('data/'));
  });

  for (const failure of ['data', 'hash'] as const) {
    const failedUrl = failure === 'data' ? dataUrl : hashUrl;

    it(`reports a ${failure} failure while unrelated requests are still pending`, async () => {
      settings.apply({ modId: 'aef' });
      attachRouter();
      const oldSettings = settings.state();
      const oldObjectives = objectives.state();
      const oldExtension = endfield.state();
      open(badAttemptUrl, '3', true);
      await settle();
      const requests = http.match((request) =>
        request.url.startsWith('data/aef/'),
      );
      expect(requests.map((request) => request.request.url).sort()).toEqual(
        [dataUrl, hashUrl, i18nUrl].sort(),
      );
      requests
        .filter((request) => request.request.url === failedUrl)
        .forEach((request) => {
          answer(request, failedUrl);
        });
      await settle();
      expect(settings.loadError()).toBeTruthy();
      expect(settings.loading()).toBeTrue();
      expect(lifecycle.ready()).toBeFalse();
      expect(lifecycle.errors().length).toBeGreaterThan(0);
      expect(lifecycle.originalInput()).toBe(badAttemptUrl);
      expectPreserved(oldSettings, oldObjectives, oldExtension);
      requests
        .filter(
          (request) => request.request.url !== failedUrl && !request.cancelled,
        )
        .forEach((request) => {
          answer(request);
        });
      await settle();
    });

    it(`retries ${failure} after a failed first navigation rolls back an unset mod`, async () => {
      expect(settings.modId()).toBeUndefined();
      attachRouter();
      const oldSettings = settings.state();
      const oldObjectives = objectives.state();
      const oldExtension = endfield.state();
      open(badAttemptUrl, '3', true);
      await settle();
      expect(answerAefRequests('initial navigation', failedUrl).sort()).toEqual(
        [dataUrl, hashUrl, i18nUrl].sort(),
      );
      await settle();
      console.info(
        `[resource-retry] after rollback: mod=${String(settings.modId())}, error=${String(settings.loadError())}, ready=${String(lifecycle.ready())}`,
      );
      expect(lifecycle.ready()).toBeFalse();
      expect(lifecycle.originalInput()).toBe(badAttemptUrl);
      expect(lifecycle.errors().length).toBeGreaterThan(0);
      expectPreserved(oldSettings, oldObjectives, oldExtension);

      open(retryUrl, '2');
      await settle();
      expect(answerAefRequests('retry after unset rollback')).toContain(
        failedUrl,
      );
      await settle();
      expectRecovered();
    });

    it(`retries an existing ${failure} error when the store is already aef`, async () => {
      settings.apply({ modId: 'aef' });
      await settle();
      expect(
        answerAefRequests('pre-existing aef load', failedUrl).sort(),
      ).toEqual([dataUrl, hashUrl, i18nUrl].sort());
      await settle();
      expect(settings.modId()).toBe('aef');
      expect(settings.loadError()).toBeTruthy();

      attachRouter();
      const oldSettings = settings.state();
      const oldObjectives = objectives.state();
      const oldExtension = endfield.state();
      open(retryUrl, '2', true);
      await settle();
      expect(lifecycle.ready()).toBeFalse();
      expect(lifecycle.originalInput()).toBe(retryUrl);
      expectPreserved(oldSettings, oldObjectives, oldExtension);
      const requests = answerAefRequests('same-aef navigation after error');
      console.info(
        `[resource-retry] same-aef state: mod=${String(settings.modId())}, error=${String(settings.loadError())}, ready=${String(lifecycle.ready())}, diagnostics=${JSON.stringify(lifecycle.errors())}`,
      );
      expect(requests).toContain(failedUrl);
      await settle();
      expectRecovered();
    });

    it(`retries ${failure} after rolling back to an existing aef mod`, async () => {
      settings.apply({ modId: 'aef' });
      attachRouter();
      const oldSettings = settings.state();
      const oldObjectives = objectives.state();
      const oldExtension = endfield.state();
      open(badAttemptUrl, '3', true);
      await settle();
      expect(
        answerAefRequests('initial aef navigation', failedUrl).sort(),
      ).toEqual([dataUrl, hashUrl, i18nUrl].sort());
      await settle();
      expect(settings.modId()).toBe('aef');
      expect(settings.loadError()).toBeTruthy();
      expect(lifecycle.ready()).toBeFalse();
      expect(lifecycle.originalInput()).toBe(badAttemptUrl);
      expect(lifecycle.errors().length).toBeGreaterThan(0);
      expectPreserved(oldSettings, oldObjectives, oldExtension);

      open(retryUrl, '2');
      await settle();
      expect(lifecycle.originalInput()).toBe(retryUrl);
      expectPreserved(oldSettings, oldObjectives, oldExtension);
      expect(answerAefRequests('retry after same-aef rollback')).toContain(
        failedUrl,
      );
      await settle();
      expectRecovered();
    });

    it(`allows another ${failure} retry after a retry also returns 503`, async () => {
      settings.apply({ modId: 'aef' });
      attachRouter();
      const oldSettings = settings.state();
      const oldObjectives = objectives.state();
      const oldExtension = endfield.state();
      open(badAttemptUrl, '3', true);
      await settle();
      expect(
        answerAefRequests('repeated failure initial load', failedUrl).sort(),
      ).toEqual([dataUrl, hashUrl, i18nUrl].sort());
      await settle();
      expect(lifecycle.ready()).toBeFalse();

      open(retryUrl, '2');
      await settle();
      expect(
        answerAefRequests('repeated failure first retry', failedUrl),
      ).toContain(failedUrl);
      await settle();
      expect(lifecycle.ready()).toBeFalse();
      expect(lifecycle.originalInput()).toBe(retryUrl);
      expectPreserved(oldSettings, oldObjectives, oldExtension);

      open('/aef/list?v=12&o=xiranite_powder*7', '7');
      await settle();
      expect(answerAefRequests('repeated failure second retry')).toContain(
        failedUrl,
      );
      await settle();
      expectRecovered(7n);
    });

    it(`uses the latest navigation immediately after a ${failure} retry starts`, async () => {
      settings.apply({ modId: 'aef' });
      attachRouter();
      open(badAttemptUrl, '3', true);
      await settle();
      answerAefRequests('immediate retry initial failure', failedUrl);
      await settle();
      expect(lifecycle.ready()).toBeFalse();
      const retry = spyOn(settings, 'retryFailedResources').and.callThrough();
      open(retryUrl, '2');
      for (let i = 0; i < 15 && !retry.calls.any(); i++)
        await Promise.resolve();
      expect(retry).toHaveBeenCalled();
      expect(settings.loading()).toBeTrue();
      open('/aef/list?v=12&o=xiranite_powder*7', '7');
      await settle();
      const pending = http.match((request) =>
        request.url.startsWith('data/aef/'),
      );
      expect(pending.map((request) => request.request.url)).toContain(
        failedUrl,
      );
      pending
        .filter((request) => !request.cancelled)
        .forEach((request) => {
          answer(request);
        });
      await settle();
      expectRecovered(7n);
      expect(lifecycle.originalInput()).toBe(
        '/aef/list?v=12&o=xiranite_powder*7',
      );
      expect(navigate).not.toHaveBeenCalled();
    });
  }

  it('commits the latest navigation when an earlier retry is still loading', async () => {
    attachRouter();
    open(badAttemptUrl, '3', true);
    await settle();
    expect(
      answerAefRequests('cancellation initial load', dataUrl).sort(),
    ).toEqual([dataUrl, hashUrl, i18nUrl].sort());
    await settle();
    expect(lifecycle.ready()).toBeFalse();
    open(retryUrl, '2');
    await settle();
    const pending = http.match((request) =>
      request.url.startsWith('data/aef/'),
    );
    console.info(
      `[resource-retry] cancellation retry: ${JSON.stringify(pending.map((request) => request.request.url))}`,
    );
    expect(pending.map((request) => request.request.url)).toContain(dataUrl);
    open('/aef/list?v=12&o=xiranite_powder*7', '7');
    await settle();
    expect(lifecycle.ready()).toBeFalse();
    expect(navigate).not.toHaveBeenCalled();
    pending.forEach((request) => {
      answer(request);
    });
    await settle();
    expectRecovered(7n);
    expect(lifecycle.originalInput()).toBe(
      '/aef/list?v=12&o=xiranite_powder*7',
    );
  });

  it('commits the latest navigation while a same-aef retry is loading', async () => {
    settings.apply({ modId: 'aef' });
    attachRouter();
    open(badAttemptUrl, '3', true);
    await settle();
    expect(
      answerAefRequests('same-aef cancellation initial load', dataUrl).sort(),
    ).toEqual([dataUrl, hashUrl, i18nUrl].sort());
    await settle();
    expect(lifecycle.ready()).toBeFalse();

    open(retryUrl, '2');
    await settle();
    const older = http.match((request) => request.url.startsWith('data/aef/'));
    expect(older.map((request) => request.request.url)).toContain(dataUrl);
    open('/aef/list?v=12&o=xiranite_powder*7', '7');
    await settle();
    const newer = http.match((request) => request.url.startsWith('data/aef/'));
    console.info(
      `[resource-retry] same-aef cancellation: older=${JSON.stringify(older.map((request) => ({ url: request.request.url, cancelled: request.cancelled })))}, newer=${JSON.stringify(newer.map((request) => request.request.url))}`,
    );
    expect(lifecycle.ready()).toBeFalse();
    expect(navigate).not.toHaveBeenCalled();
    [...older, ...newer]
      .filter((request) => !request.cancelled)
      .forEach((request) => {
        answer(request);
      });
    await settle();
    expectRecovered(7n);
    expect(lifecycle.originalInput()).toBe(
      '/aef/list?v=12&o=xiranite_powder*7',
    );
  });

  it('retries both data and hash when both fail', async () => {
    settings.apply({ modId: 'aef' });
    attachRouter();
    open(badAttemptUrl, '3', true);
    await settle();
    expect(
      answerAefRequests('both resources fail', [dataUrl, hashUrl]).sort(),
    ).toEqual([dataUrl, hashUrl, i18nUrl].sort());
    await settle();
    expect(lifecycle.ready()).toBeFalse();
    expect(settings.loadError()).toBeTruthy();

    open(retryUrl, '2');
    await settle();
    const requests = answerAefRequests('retry both resources');
    expect(requests).toContain(dataUrl);
    expect(requests).toContain(hashUrl);
    await settle();
    expectRecovered();
  });

  for (const [failed, pending] of [
    [dataUrl, hashUrl],
    [hashUrl, dataUrl],
  ] as const) {
    it(`reports a new ${failed} failure while the simultaneous ${pending} retry is pending`, async () => {
      settings.apply({ modId: 'aef' });
      attachRouter();
      const oldSettings = settings.state();
      const oldObjectives = objectives.state();
      const oldExtension = endfield.state();
      open(badAttemptUrl, '3', true);
      await settle();
      expect(
        answerAefRequests('both initial failures', [dataUrl, hashUrl]).sort(),
      ).toEqual([dataUrl, hashUrl, i18nUrl].sort());
      await settle();
      expect(lifecycle.ready()).toBeFalse();
      open(retryUrl, '2');
      await settle();
      const data = http.expectOne(dataUrl);
      const hash = http.expectOne(hashUrl);
      answer(failed === dataUrl ? data : hash, failed);
      await settle();
      expect(settings.loading()).toBeTrue();
      expect(lifecycle.ready()).toBeFalse();
      expect(lifecycle.errors().join(' ')).toContain(failed);
      expect(lifecycle.originalInput()).toBe(retryUrl);
      expectPreserved(oldSettings, oldObjectives, oldExtension);
      const other = pending === dataUrl ? data : hash;
      if (!other.cancelled) answer(other);
      await settle();
    });
  }

  it('retries the failed resource while the other requests are still pending', async () => {
    settings.apply({ modId: 'aef' });
    attachRouter();
    open(badAttemptUrl, '3', true);
    await settle();
    const data = http.expectOne(dataUrl);
    const hash = http.expectOne(hashUrl);
    const translation = http.expectOne(i18nUrl);
    answer(data, dataUrl);
    await settle();
    expect(lifecycle.ready()).toBeFalse();
    expect(settings.loadError()).toBeTruthy();

    open(retryUrl, '2');
    await settle();
    const requests = http.match((request) =>
      request.url.startsWith('data/aef/'),
    );
    console.info(
      `[resource-retry] retry with other requests pending: ${JSON.stringify(requests.map((request) => request.request.url))}`,
    );
    expect(requests.map((request) => request.request.url)).toContain(dataUrl);
    [hash, translation, ...requests]
      .filter((request) => !request.cancelled)
      .forEach((request) => {
        answer(request);
      });
    await settle();
    expectRecovered();
  });

  it('reports a new retry failure while other original requests remain pending', async () => {
    settings.apply({ modId: 'aef' });
    attachRouter();
    const oldSettings = settings.state();
    const oldObjectives = objectives.state();
    const oldExtension = endfield.state();
    open(badAttemptUrl, '3', true);
    await settle();
    const data = http.expectOne(dataUrl);
    const hash = http.expectOne(hashUrl);
    const translation = http.expectOne(i18nUrl);
    answer(data, dataUrl);
    await settle();
    expect(lifecycle.errors().length).toBeGreaterThan(0);

    open(retryUrl, '2');
    await settle();
    const retry = http.match(dataUrl);
    expect(retry.length).toBe(1);
    retry.forEach((request) => {
      answer(request, dataUrl);
    });
    await settle();
    expect(settings.loadError()).toBeTruthy();
    expect(settings.loading()).toBeTrue();
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.errors().length).toBeGreaterThan(0);
    expect(lifecycle.originalInput()).toBe(retryUrl);
    expectPreserved(oldSettings, oldObjectives, oldExtension);

    [hash, translation]
      .filter((request) => !request.cancelled)
      .forEach((request) => {
        answer(request);
      });
    await settle();
    open('/aef/list?v=12&o=xiranite_powder*7', '7');
    await settle();
    expect(answerAefRequests('retry after pending-request failure')).toContain(
      dataUrl,
    );
    await settle();
    expectRecovered(7n);
  });
});

describe('SettingsStore resource errors', () => {
  let service: SettingsStore;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    service = TestBed.inject(SettingsStore);
  });
  it('reports data and hash failures while ignoring translation failures', () => {
    const dataError = new Error('data');
    const hashError = new Error('hash');
    const data = signal<Error | undefined>(undefined);
    const hash = signal<Error | undefined>(undefined);
    spyOn(service['modDataResource'], 'error').and.callFake(data);
    spyOn(service['modHashResource'], 'error').and.callFake(hash);
    spyOn(service['modI18nResource'], 'error').and.returnValue(
      new Error('translation'),
    );
    expect(service.loadError()).toBeUndefined();
    data.set(dataError);
    expect(service.loadError()).toBe(dataError);
    data.set(undefined);
    hash.set(hashError);
    expect(service.loadError()).toBe(hashError);
  });
});
describe('SettingsStore resource retries', () => {
  let service: SettingsStore;
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SettingsStore);
    TestBed.inject(PreferencesStore).apply({ language: 'zh' });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    localStorage.clear();
  });
  it('uses the English base data without requesting an English entity package', () => {
    TestBed.inject(PreferencesStore).apply({ language: 'en' });
    service.apply({ modId: 'aef' });
    TestBed.tick();
    http.expectOne('data/aef/data.json').flush(rawData);
    http.expectOne('data/aef/hash.json').flush(rawHash);
    http.expectNone((request) => request.url.startsWith('data/aef/i18n/'));
  });
  it('does not issue duplicate retries while failed data and hash requests reload', async () => {
    service.apply({ modId: 'aef' });
    TestBed.tick();
    for (const path of ['data', 'hash']) {
      http.expectOne(`data/aef/${path}.json`).flush('unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      });
    }
    http.expectOne('data/aef/i18n/zh.json').flush({});
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();
    expect(service.loading()).toBeFalse();
    expect(service.loadError()).toBeDefined();

    expect(service.retryFailedResources()).toBeTrue();
    expect(service.loading()).toBeTrue();
    expect(service.loadError()).toBeUndefined();
    expect(service.retryFailedResources()).toBeFalse();
    TestBed.tick();
    const dataRetry = http.expectOne('data/aef/data.json');
    const hashRetry = http.expectOne('data/aef/hash.json');
    http.expectNone('data/aef/data.json');
    http.expectNone('data/aef/hash.json');
    dataRetry.flush(emptyModData());
    hashRetry.flush(mockModHash);
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();
    expect(service.loading()).toBeFalse();
    expect(service.loadError()).toBeUndefined();
    expect(service.modData()).toEqual(emptyModData());
    expect(service.modHash()).toEqual(mockModHash);
    expect(service.retryFailedResources()).toBeFalse();
  });
});
