import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CUSTOM_MOD } from '~/data/game';
import { createEndfieldState } from '~/endfield/domain/model';
import { createEndfieldProduct } from '~/endfield/product/product';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import {
  PRESENTATION_EXTENSION,
  upstreamPresentation,
} from '~/extensions/presentation-extension';
import {
  EFFECTIVE_DEFAULTS,
  PRODUCT_PROFILE,
  upstreamProduct,
} from '~/extensions/product-profile';
import { STATE_EXTENSION } from '~/extensions/state-extension';
import { rational } from '~/rational/rational';
import { Step } from '~/solver/step';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { mockModData, mockModHash } from '~/tests/mocks/data';
import { TestModule } from '~/tests/test-module';

import { provideEndfieldStateExtension } from './state-extension';

describe('EndfieldStateExtension', () => {
  it('reads the independent live snapshot and commits or resets only that state', () => {
    TestBed.configureTestingModule({
      providers: [
        ...provideEndfieldStateExtension(),
        {
          provide: EFFECTIVE_DEFAULTS,
          useValue: {
            ...upstreamProduct.defaults(),
            extension: createEndfieldState(),
          },
        },
      ],
    });
    const extension = TestBed.inject(STATE_EXTENSION);
    const store = TestBed.inject(EndfieldStore);
    const original = extension.encode(extension.snapshot());
    store.set({ ...store.snapshot(), electric: rational(3) });
    expect(extension.encode(extension.snapshot())).not.toEqual(original);
    extension.commit(createEndfieldState());
    expect(extension.encode(extension.snapshot())).toEqual(original);
    store.set({ ...store.snapshot(), electric: rational(2) });
    extension.reset();
    expect(store.snapshot().electric).toEqual(rational.one);
    expect(extension.strictImports).toBeTrue();
  });
});

describe('SettingsStore dataset selection', () => {
  let service: SettingsStore;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    service = TestBed.inject(SettingsStore);
  });
  it('falls back when a saved mod identifier is unknown', () => {
    service.apply({ modId: 'missing-dataset' });
    expect(service.modInfo()).toBeUndefined();
    expect(service.game()).toBe('factorio');
  });
});
describe('SettingsStore with Endfield product', () => {
  let service: SettingsStore;
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(false, 'zh'),
        },
      ],
    });
    service = TestBed.inject(SettingsStore);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    localStorage.clear();
  });
  it('filters runtime options and never requests other game or custom data', () => {
    expect(service.gameOptions.map((option) => option.value)).toEqual([
      'endfield',
    ]);
    service.apply({ modId: '2x1' });
    TestBed.tick();
    expect(service.modData()).toBeUndefined();
    expect(service.modHash()).toBeUndefined();
    expect(service.modOptions()).toEqual([]);
    http.expectNone((request) => request.url.startsWith('data/2x1/'));
    service.apply({ modId: CUSTOM_MOD });
    TestBed.tick();
    expect(service.modData()).toBeUndefined();
    http.expectNone((request) => request.url.startsWith('data/cst/'));
  });
  it('prepares a candidate from effective defaults without changing the live store', () => {
    const before = service.state();
    const result = service.prepareState(
      { modId: 'aef', costs: { surplus: rational.zero } },
      mockModData,
      mockModHash,
    );
    expect(result.data.modId).toBe('aef');
    expect(result.settings.costs.surplus.eq(rational.zero)).toBeTrue();
    expect(result.settings.costs.recycling.eq(rational(1000))).toBeTrue();
    expect(service.state()).toBe(before);
    expect(() =>
      service.prepareState({ modId: '2x1' }, mockModData, mockModHash),
    ).toThrow();
  });
});
describe('ObjectivesStore presentation of normalized steps', () => {
  it('returns the normalized array and step references for the default presentation without invoking its hook', () => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    const service = TestBed.inject(ObjectivesStore);
    const normalized: Step[] = [{ id: 'ordinary', checked: true }];
    spyOn(service['normalization'], 'normalizeSteps').and.returnValue(
      normalized,
    );
    const checked = spyOn(upstreamPresentation, 'checked').and.callThrough();
    expect(service.steps()).toBe(normalized);
    expect(service.steps()[0]).toBe(normalized[0]);
    expect(service.steps()[0].checked).toBeTrue();
    expect(checked).not.toHaveBeenCalled();
  });
  it('uses the custom checked hook and retains ordinary checked values when it returns undefined', () => {
    const presentation = {
      ...upstreamPresentation,
      checked: jasmine
        .createSpy('checked')
        .and.callFake((step: Step) =>
          step.id === 'derived' ? true : undefined,
        ),
    };
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [{ provide: PRESENTATION_EXTENSION, useValue: presentation }],
    });
    const service = TestBed.inject(ObjectivesStore);
    const normalized: Step[] = [
      { id: 'derived', checked: false },
      { id: 'ordinary', checked: true },
    ];
    spyOn(service['normalization'], 'normalizeSteps').and.returnValue(
      normalized,
    );
    const steps = service.steps();
    expect(steps).not.toBe(normalized);
    expect(steps[0]).not.toBe(normalized[0]);
    expect(steps.map((step) => step.checked)).toEqual([true, true]);
    expect(presentation.checked).toHaveBeenCalledTimes(2);
  });
});
