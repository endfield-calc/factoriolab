import { Signal, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';

import { EndfieldData, EndfieldName } from '../domain/game-data';
import { createEndfieldState, ovenId } from '../domain/model';
import { EndfieldTransferData } from '../domain/transfer';
import { EndfieldStore } from '../state/endfield-store';
import { EndfieldResources } from './resources';

interface TestSettings {
  locationIds: Set<string>;
  defaultLocationIds: Set<string>;
  excludedRecipeIds: Set<string>;
  otherPreference: string;
}

const name = (en: string, zh: string): EndfieldName => ({
  en,
  zh,
  ja: en,
  ru: en,
});
const regionData: EndfieldData = {
  schemaVersion: 1,
  activities: {
    limited_formula_1: {
      name: name('First event', '一号活动'),
      openTime: 1000,
      closeTime: 3000,
      stageStarts: [1000, 1100, 1200, 2000],
      recipeUnlocks: {},
    },
    limited_formula_2: {
      name: name('Second event', '二号活动'),
      openTime: 1000,
      closeTime: 2000,
      stageStarts: [1000],
      recipeUnlocks: {},
    },
  },
  domains: [
    {
      domainId: 'domain_1',
      locationId: 'tundra',
      domainName: name('Valley IV', '四号谷地'),
      couponItemId: 'tundra_coupon',
      maxLevel: 4,
      mineSummary: [
        { itemId: 'originium_ore', outputPerMinute: 602.5 },
        { itemId: 'iron_ore', outputPerMinute: 1090 },
        { itemId: 'quartz_sand', outputPerMinute: 250 },
      ],
      settlements: [
        {
          settlementId: 'settlement_1',
          settlementName: name('First settlement', '一号据点'),
          operatorBonusRate: 20,
          levels: [
            {
              level: 1,
              baseMoneySpeed: 49,
              moneyMax: 18000,
              towerDefenseRate: 0,
            },
            {
              level: 4,
              baseMoneySpeed: 347,
              moneyMax: 2200000,
              towerDefenseRate: 15,
            },
          ],
          activities: [
            {
              activityId: 'activity_limited_formula_1',
              activityName: name('First event', '一号活动'),
              phases: [
                { startTime: 1000, endTime: 1100, rate: 30 },
                { startTime: 1200, endTime: 2000, rate: 50 },
                { startTime: 2000, endTime: 3500, rate: 100 },
              ],
            },
          ],
        },
        {
          settlementId: 'settlement_2',
          settlementName: name('Second settlement', '二号据点'),
          operatorBonusRate: 10,
          levels: [
            {
              level: 1,
              baseMoneySpeed: 10,
              moneyMax: 1000,
              towerDefenseRate: 0,
            },
            {
              level: 3,
              baseMoneySpeed: 125,
              moneyMax: 100000,
              towerDefenseRate: 5,
            },
          ],
          activities: [
            {
              activityId: 'activity_limited_formula_2',
              activityName: name('Second event', '二号活动'),
              phases: [{ startTime: 1000, endTime: 2000, rate: 10 }],
            },
          ],
        },
      ],
    },
    {
      domainId: 'domain_2',
      locationId: 'jinlong',
      domainName: name('Wuling', '武陵'),
      couponItemId: 'jinlong_coupon',
      maxLevel: 4,
      machineLimits: { [ovenId]: 16 },
      mineSummary: [
        { itemId: 'originium_ore', outputPerMinute: 550 },
        { itemId: 'copper_ore', outputPerMinute: 520 },
        { itemId: 'gas_inert', outputPerMinute: 470 },
      ],
      settlements: [
        {
          settlementId: 'settlement_3',
          settlementName: name('Third settlement', '三号据点'),
          operatorBonusRate: 5,
          levels: [
            {
              level: 2,
              baseMoneySpeed: 70,
              moneyMax: 20000,
              towerDefenseRate: 25,
            },
          ],
          activities: [],
        },
      ],
    },
  ],
};

function createSettings(): {
  settings: WritableSignal<TestSettings>;
  dataset: Signal<{
    itemRecord: { iron_ore: { name: string } };
    locationRecord: Record<string, { name: string }>;
  }>;
  transferData: WritableSignal<EndfieldTransferData | undefined>;
  endfieldData: WritableSignal<EndfieldData | undefined>;
  activityTimes: WritableSignal<Record<string, number>>;
  apply(patch: Partial<TestSettings>): void;
} {
  const settings = signal<TestSettings>({
    locationIds: new Set(['tundra', 'jinlong']),
    defaultLocationIds: new Set(['tundra', 'jinlong']),
    excludedRecipeIds: new Set([
      'unrelated',
      'sewage-treat',
      'sewage-treat-export',
    ]),
    otherPreference: 'keep',
  });
  return {
    settings,
    dataset: signal({
      itemRecord: { iron_ore: { name: 'Iron Ore' } },
      locationRecord: {
        tundra: { name: 'Valley' },
        jinlong: { name: 'Wuling' },
      },
    }),
    transferData: signal<EndfieldTransferData | undefined>({
      schemaVersion: 1,
      sources: [
        { domainId: 'domain_1', locationId: 'tundra', capacity: 1500 },
        { domainId: 'domain_2', locationId: 'jinlong', capacity: 800 },
      ],
      items: [],
    }),
    endfieldData: signal<EndfieldData | undefined>(regionData),
    activityTimes: signal<Record<string, number>>({
      limited_formula_1: 500,
      limited_formula_2: 500,
    }),
    apply(patch: Partial<TestSettings>): void {
      settings.update((value) => ({ ...value, ...patch }));
    },
  };
}

describe('EndfieldResources', () => {
  it('gives a settlement without level data no share of the region total', () => {
    const outpost = { ...regionData.domains[0].settlements[0], levels: [] };
    expect(
      fixture.componentInstance['regionCouponRate']({
        ...regionData.domains[0],
        settlements: [outpost],
      }),
    ).toEqual(rational.zero);
  });
  let fixture: ComponentFixture<EndfieldResources>;
  let store: EndfieldStore;
  let settingsStore: ReturnType<typeof createSettings>;

  function button(name: string): HTMLButtonElement {
    return [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ].find((element) => element.textContent?.includes(name))!;
  }

  function checkbox(index: number): HTMLInputElement {
    return (fixture.nativeElement as HTMLElement).querySelectorAll(
      'lab-checkbox input',
    )[index] as HTMLInputElement;
  }

  function edit(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  function setActivityTime(id: string, time: number): void {
    settingsStore.activityTimes.update((times) => ({ ...times, [id]: time }));
    fixture.detectChanges();
  }

  function displayedCouponRate(element: Element): string | undefined {
    const label = [...element.querySelectorAll('dt')].find((dt) =>
      dt.textContent?.includes('endfield.resources.couponSpeed'),
    );
    return label?.nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim();
  }

  beforeEach(async () => {
    settingsStore = createSettings();
    await TestBed.configureTestingModule({
      imports: [TestModule, EndfieldResources],
      providers: [{ provide: SettingsStore, useValue: settingsStore }],
    }).compileComponents();
    store = TestBed.inject(EndfieldStore);
    fixture = TestBed.createComponent(EndfieldResources);
    fixture.detectChanges();
  });

  it('edits physical rates and fractional machine counts while preserving source settings', async () => {
    store.set({
      ...createEndfieldState(),
      resourceRecipeSettings: {
        originium_ore: { machineId: 'miner_3', overclock: rational(125) },
      },
      checkedDerived: new Set(['originium_ore']),
    });
    const previous = store.state();
    checkbox(0).click();
    checkbox(1).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'lab-input-number input',
    );
    edit(inputs[0] as HTMLInputElement, '90');
    edit(inputs[6] as HTMLInputElement, '5/2');

    expect(store.state().resourceLimits.enabled).toBeTrue();
    expect(store.state().resourceLimits.rates.originium_ore).toEqual(
      rational(3, 2),
    );
    expect((inputs[0] as HTMLInputElement).value).toBe('90');
    expect(store.state().machineLimits.enabled).toBeTrue();
    expect(store.state().machineLimits.limits[ovenId]).toEqual(rational(5, 2));
    expect(store.state().resourceRecipeSettings).toEqual(
      previous.resourceRecipeSettings,
    );
    expect(store.state().checkedDerived).toEqual(previous.checkedDerived);
    expect(previous.resourceLimits.enabled).toBeFalse();
    expect(previous.resourceLimits.rates.originium_ore).toEqual(rational.zero);
    expect(previous.machineLimits.enabled).toBeFalse();

    checkbox(0).click();
    fixture.detectChanges();
    expect(store.state().resourceLimits.enabled).toBeFalse();
    expect(store.state().resourceLimits.rates.originium_ore).toEqual(
      rational(3, 2),
    );
    expect(store.state().resourceRecipeSettings).toEqual(
      previous.resourceRecipeSettings,
    );
    expect(store.state().checkedDerived).toEqual(previous.checkedDerived);
  });

  it('does not write empty or negative resource and machine inputs', async () => {
    const initial = createEndfieldState();
    store.set({
      ...initial,
      resourceLimits: {
        enabled: true,
        rates: {
          ...initial.resourceLimits.rates,
          originium_ore: rational(3, 2),
        },
      },
      machineLimits: { enabled: true, limits: { [ovenId]: rational(7, 2) } },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const before = store.state();
    const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'lab-input-number input',
    );
    for (const index of [0, 6]) {
      edit(inputs[index] as HTMLInputElement, '-1');
      expect(inputs[index].classList).toContain('ng-invalid');
      expect(store.state()).toBe(before);
      edit(inputs[index] as HTMLInputElement, '');
      expect(store.state()).toBe(before);
    }
    edit(inputs[0] as HTMLInputElement, '1');
    edit(inputs[6] as HTMLInputElement, '0.5');
    expect(store.state().resourceLimits.rates.originium_ore).toEqual(
      rational(1, 60),
    );
    expect(store.state().machineLimits.limits[ovenId]).toEqual(rational(1, 2));
  });

  for (const submit of ['blur', 'enter'] as const) {
    it(`commits a preset rate on ${submit} after intermediate change detection`, async () => {
      button('endfield.resources.presetTundra').click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const input = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLInputElement>('lab-input-number input')!;
      expect(input.value).toBe(
        store
          .state()
          .resourceLimits.rates.originium_ore.mul(rational(60))
          .toString(),
      );

      input.value = '90';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      input.dispatchEvent(
        submit === 'blur'
          ? new Event('blur')
          : new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      await fixture.whenStable();
      fixture.detectChanges();
      expect(store.state().resourceLimits.rates.originium_ore).toEqual(
        rational(3, 2),
      );
      expect(input.value).toBe('90');
    });
  }

  it('applies all Tundra rates, resets source settings, and retains electricity and exclusions', () => {
    store.set({
      ...createEndfieldState(),
      electric: rational(2),
      activityModes: { limited_formula_1: 1200 },
      resourceRecipeSettings: { originium_ore: { machineId: 'miner' } },
      checkedDerived: new Set(['originium_ore']),
    });
    const before = store.state();
    const exclusions = settingsStore.settings().excludedRecipeIds;
    button('endfield.resources.presetTundra').click();
    expect(
      Object.values(store.state().resourceLimits.rates).some((rate) =>
        rate.gt(rational.zero),
      ),
    ).toBeTrue();
    expect(store.state().resourceLimits.enabled).toBeTrue();
    expect(store.state().resourceLimits.rates.originium_ore).toEqual(
      rational(1205, 120),
    );
    expect(store.state().resourceLimits.rates.iron_ore).toEqual(
      rational(1090, 60),
    );
    expect(store.state().resourceLimits.rates.copper_ore).toEqual(
      rational.zero,
    );
    expect(store.state().machineLimits).toEqual({
      enabled: false,
      limits: { [ovenId]: rational(16) },
    });
    expect(store.state().transferEnabled).toBeFalse();
    expect(store.state().electric).toEqual(rational(2));
    expect(store.state().activityModes).toEqual({
      limited_formula_1: 1200,
    });
    expect(store.state().resourceRecipeSettings).toEqual({});
    expect(store.state().checkedDerived.size).toBe(0);
    expect(before.resourceRecipeSettings.originium_ore?.machineId).toBe(
      'miner',
    );
    expect(before.checkedDerived.has('originium_ore')).toBeTrue();
    expect(settingsStore.settings().locationIds).toEqual(new Set(['tundra']));
    expect(settingsStore.settings().excludedRecipeIds).toBe(exclusions);
    expect(settingsStore.settings().otherPreference).toBe('keep');
  });

  it('applies all Jinlong rates and clears restrictions without changing unrelated settings', () => {
    store.set({
      ...createEndfieldState(),
      electric: rational(3),
      activityModes: { limited_formula_2: 'disabled' },
      resourceRecipeSettings: { iron_ore: { machineId: 'miner' } },
      checkedDerived: new Set(['iron_ore']),
    });
    button('endfield.resources.presetJinlong').click();
    expect(
      Object.values(store.state().resourceLimits.rates).some((rate) =>
        rate.gt(rational.zero),
      ),
    ).toBeTrue();
    expect(store.state().resourceLimits.enabled).toBeTrue();
    expect(store.state().resourceLimits.rates.originium_ore).toEqual(
      rational(550, 60),
    );
    expect(store.state().resourceLimits.rates.copper_ore).toEqual(
      rational(520, 60),
    );
    expect(store.state().resourceLimits.rates.quartz_sand).toEqual(
      rational.zero,
    );
    expect(store.state().machineLimits).toEqual({
      enabled: true,
      limits: { [ovenId]: rational(16) },
    });
    expect(store.state().transferEnabled).toBeTrue();
    expect(store.state().electric).toEqual(rational(3));
    expect(store.state().activityModes).toEqual({
      limited_formula_2: 'disabled',
    });
    expect(store.state().resourceRecipeSettings).toEqual({});
    expect(store.state().checkedDerived.size).toBe(0);
    expect(settingsStore.settings().locationIds).toEqual(new Set(['jinlong']));
    expect(settingsStore.settings().excludedRecipeIds).toEqual(
      new Set(['unrelated']),
    );
    expect(settingsStore.settings().otherPreference).toBe('keep');

    fixture.componentInstance['setWaterDisabled'](true);
    store.updateResourceRecipeField('iron_ore', 'machineId', 'miner');
    store.setResourceChecked('iron_ore', true);
    const defaults = settingsStore.settings().defaultLocationIds;
    button('endfield.resources.clear').click();
    expect(store.state()).toEqual({
      ...createEndfieldState(),
      electric: rational(3),
      activityModes: { limited_formula_2: 'disabled' },
    });
    expect(settingsStore.settings().locationIds).toEqual(defaults);
    expect(settingsStore.settings().locationIds).not.toBe(defaults);
    expect(settingsStore.settings().excludedRecipeIds).toEqual(
      new Set(['unrelated']),
    );
    expect(settingsStore.settings().otherPreference).toBe('keep');
  });

  it('uses the machine limit from the selected region data', () => {
    settingsStore.endfieldData.update((data) => ({
      ...data!,
      domains: data!.domains.map((domain) =>
        domain.locationId === 'jinlong'
          ? { ...domain, machineLimits: { [ovenId]: 9 } }
          : domain,
      ),
    }));
    button('endfield.resources.presetJinlong').click();
    expect(store.state().machineLimits.limits[ovenId]).toEqual(rational(9));
  });

  it('changes only the two water exclusions', async () => {
    const before = store.state();
    const original = settingsStore.settings().excludedRecipeIds;
    await fixture.whenStable();
    fixture.detectChanges();
    expect(checkbox(3).checked).toBeTrue();
    checkbox(3).click();
    fixture.detectChanges();
    expect(settingsStore.settings().excludedRecipeIds).toEqual(
      new Set(['unrelated']),
    );
    expect(original.size).toBe(3);
    expect(store.state()).toBe(before);
    checkbox(3).click();
    fixture.detectChanges();
    expect(settingsStore.settings().excludedRecipeIds).toEqual(original);
    expect(store.state()).toBe(before);
  });

  it('filters the selected region from sources, and permits an existing switch to be disabled', async () => {
    settingsStore.settings.update((value) => ({
      ...value,
      locationIds: new Set(['tundra']),
    }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      fixture.componentInstance['transferSources']().map(
        (source) => source.value,
      ),
    ).toEqual(['jinlong']);
    expect(checkbox(2).disabled).toBeTrue();
    fixture.componentInstance['setTransferSource']('jinlong');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(checkbox(2).disabled).toBeFalse();
    checkbox(2).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.state().transferEnabled).toBeTrue();
    settingsStore.settings.update((value) => ({
      ...value,
      locationIds: new Set(['jinlong']),
    }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(checkbox(2).disabled).toBeFalse();
    checkbox(2).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.state().transferEnabled).toBeFalse();
    expect(checkbox(2).disabled).toBeTrue();
  });

  it('lets the user select a source and includes all sources in multi-region mode', () => {
    settingsStore.settings.update((value) => ({
      ...value,
      locationIds: new Set(['jinlong']),
    }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('lab-select')).not.toBeNull();
    expect(
      fixture.componentInstance['transferSources']().map(
        (source) => source.value,
      ),
    ).toEqual(['tundra']);
    expect(checkbox(2).disabled).toBeFalse();
    checkbox(2).click();
    expect(store.state().transferEnabled).toBeTrue();
    settingsStore.settings.update((value) => ({
      ...value,
      locationIds: new Set(['tundra', 'jinlong']),
    }));
    fixture.detectChanges();
    expect(
      fixture.componentInstance['transferSources']().map(
        (source) => source.value,
      ),
    ).toEqual(['tundra', 'jinlong']);
    fixture.componentInstance['setTransferSource']('jinlong');
    expect(store.state().transferSource).toBe('jinlong');
  });

  it('offers no transfer source when no destination is selected', async () => {
    settingsStore.settings.update((value) => ({
      ...value,
      locationIds: new Set(),
    }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance['transferSources']()).toEqual([]);
    expect(checkbox(2).disabled).toBeTrue();
  });

  it('offers no sources before the transfer file loads', () => {
    settingsStore.transferData.set(undefined);
    expect(fixture.componentInstance['transferSources']()).toEqual([]);
  });

  it('shows a source ID while its location name is unavailable', () => {
    delete settingsStore.dataset().locationRecord['tundra'];
    settingsStore.settings.update((value) => ({
      ...value,
      locationIds: new Set(['jinlong']),
    }));
    expect(fixture.componentInstance['transferSources']()[0].label).toBe(
      'tundra',
    );
  });

  it('disables unavailable presets without changing the existing configuration', () => {
    const before = store.state();
    const settingsBefore = settingsStore.settings();
    settingsStore.endfieldData.set(undefined);
    fixture.detectChanges();
    expect(button('endfield.resources.presetTundra').disabled).toBeTrue();
    expect(button('endfield.resources.presetJinlong').disabled).toBeTrue();
    fixture.componentInstance['applyPreset']('tundra');
    expect(store.state()).toBe(before);
    expect(settingsStore.settings()).toBe(settingsBefore);
    settingsStore.endfieldData.set(regionData);
    fixture.detectChanges();
    expect(button('endfield.resources.presetTundra').disabled).toBeFalse();
  });

  it('sums each settlement coupon rate in its region and follows each activity time independently', () => {
    button('endfield.resources.regions').click();
    fixture.detectChanges();
    button('Valley IV').click();
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    const [first, second] = [...html.querySelectorAll('section')];
    const valley = first.closest('lab-accordion-item')!;
    const valleyRate = valley.querySelector('dl')!;
    const perMinute = 'endfield.resources.perMinute';

    expect(displayedCouponRate(first)).toBe(`468.45 ${perMinute}`);
    expect(displayedCouponRate(second)).toBe(`143.75 ${perMinute}`);
    expect(displayedCouponRate(valleyRate)).toBe(`612.2 ${perMinute}`);

    setActivityTime('limited_formula_1', 1000);
    setActivityTime('limited_formula_2', 1000);
    expect(displayedCouponRate(first)).toBe(`572.55 ${perMinute}`);
    expect(displayedCouponRate(second)).toBe(`156.25 ${perMinute}`);
    expect(displayedCouponRate(valleyRate)).toBe(`728.8 ${perMinute}`);

    setActivityTime('limited_formula_1', -Infinity);
    expect(first.textContent).not.toContain('First event');
    expect(second.textContent).toContain('Second event');
    expect(displayedCouponRate(first)).toBe(`468.45 ${perMinute}`);
    expect(displayedCouponRate(valleyRate)).toBe(`624.7 ${perMinute}`);

    setActivityTime('limited_formula_1', 2000);
    expect(first.textContent).toContain('+100%');
    expect(displayedCouponRate(first)).toBe(`815.45 ${perMinute}`);
    expect(displayedCouponRate(second)).toBe(`156.25 ${perMinute}`);
    expect(displayedCouponRate(valleyRate)).toBe(`971.7 ${perMinute}`);

    setActivityTime('limited_formula_2', -Infinity);
    expect(second.textContent).not.toContain('Second event');
    expect(displayedCouponRate(second)).toBe(`143.75 ${perMinute}`);
    expect(displayedCouponRate(valleyRate)).toBe(`959.2 ${perMinute}`);

    button('Wuling').click();
    fixture.detectChanges();
    const third = [...html.querySelectorAll('section')].find((section) =>
      section.textContent?.includes('Third settlement'),
    )!;
    const wuling = third.closest('lab-accordion-item')!;
    expect(displayedCouponRate(third)).toBe(`91 ${perMinute}`);
    expect(displayedCouponRate(wuling.querySelector('dl')!)).toBe(
      `91 ${perMinute}`,
    );
  });

  it('browses only highest-level settlement values and active bonuses by source', () => {
    const preferences = TestBed.inject(PreferencesStore);
    const previousLanguage = preferences.state().language;
    const savedPreferences = localStorage.getItem('preferences');
    const language = signal<'en' | 'zh'>('en');
    spyOn(preferences, 'language').and.callFake(language);
    const before = store.state();
    button('endfield.resources.regions').click();
    fixture.detectChanges();
    button('Valley IV').click();
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    const settlement = html.querySelector('section')!;
    expect(settlement.textContent).toContain('First settlement');
    expect(settlement.textContent).toContain('2200000');
    expect(settlement.textContent).toContain('347');
    expect(settlement.textContent).not.toContain('18000');
    expect(settlement.textContent).not.toContain('49');
    expect(settlement.textContent).toContain(
      'endfield.resources.towerDefenseBonus',
    );
    expect(settlement.textContent).toContain('+15%');
    expect(settlement.textContent).toContain(
      'endfield.resources.operatorBonus',
    );
    expect(settlement.textContent?.match(/\+20%/g)?.length).toBe(1);
    expect(settlement.textContent).not.toContain('First event');
    expect(html.textContent).toContain('602.5');
    expect(html.textContent).toContain('Iron Ore');
    expect(store.state()).toBe(before);

    setActivityTime('limited_formula_1', 1000);
    expect(settlement.textContent).toContain(
      'endfield.resources.activityBonus',
    );
    expect(settlement.textContent).toContain('First event');
    expect(settlement.textContent).toContain('+30%');
    setActivityTime('limited_formula_1', 1100);
    expect(settlement.textContent).not.toContain('First event');
    setActivityTime('limited_formula_1', 1200);
    expect(settlement.textContent).toContain('+50%');
    setActivityTime('limited_formula_1', 2000);
    expect(settlement.textContent).not.toContain('+50%');
    expect(settlement.textContent).toContain('+100%');
    setActivityTime('limited_formula_1', 2999);
    expect(settlement.textContent).toContain('First event');
    expect(settlement.textContent).toContain('+100%');
    // The store disables the event at closeTime even if a phase extends past it.
    setActivityTime('limited_formula_1', -Infinity);
    expect(settlement.textContent).not.toContain('First event');
    expect(settlement.textContent).not.toContain('+100%');

    language.set('zh');
    fixture.detectChanges();
    expect(html.textContent).toContain('四号谷地');
    expect(settlement.textContent).toContain('一号据点');
    expect(store.state()).toBe(before);
    expect(preferences.state().language).toBe(previousLanguage);
    expect(localStorage.getItem('preferences')).toBe(savedPreferences);
  });
});
