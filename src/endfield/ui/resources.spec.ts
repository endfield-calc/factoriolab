import { Signal, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { WorkspaceLifecycle } from '~/state/workspace-lifecycle';
import { TestModule } from '~/tests/test-module';

import {
  createEndfieldState,
  ovenId,
  ResourceId,
  resourceIds,
  resourceOwner,
} from '../domain/model';
import { EndfieldStore } from '../state/endfield-store';
import { EndfieldResources } from './resources';

interface TestSettings {
  locationIds: Set<string>;
  defaultLocationIds: Set<string>;
  excludedRecipeIds: Set<string>;
  otherPreference: string;
}

function createSettings(): {
  settings: WritableSignal<TestSettings>;
  dataset: Signal<{ itemRecord: { iron_ore: { name: string } } }>;
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
    dataset: signal({ itemRecord: { iron_ore: { name: 'Iron Ore' } } }),
    apply(patch: Partial<TestSettings>): void {
      settings.update((value) => ({ ...value, ...patch }));
    },
  };
}

describe('EndfieldResources', () => {
  let fixture: ComponentFixture<EndfieldResources>;
  let store: EndfieldStore;
  let lifecycle: WorkspaceLifecycle;
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

  function expectRates(values: Record<ResourceId, number>): void {
    for (const id of resourceIds) {
      expect(store.state().resourceLimits.rates[id])
        .withContext(id)
        .toEqual(rational(values[id], 60));
    }
  }

  beforeEach(async () => {
    settingsStore = createSettings();
    await TestBed.configureTestingModule({
      imports: [TestModule, EndfieldResources],
      providers: [
        { provide: SettingsStore, useValue: settingsStore },
        {
          provide: PreferencesStore,
          useValue: {
            restoreError: signal('Unable to restore preferences'),
            stored: (): string => '{"theme":"black"}',
          },
        },
      ],
    }).compileComponents();
    store = TestBed.inject(EndfieldStore);
    lifecycle = TestBed.inject(WorkspaceLifecycle);
    fixture = TestBed.createComponent(EndfieldResources);
    fixture.detectChanges();
  });

  it('edits physical rates and fractional machine counts while preserving source settings', async () => {
    store.set({
      ...createEndfieldState(),
      resourceRecipeSettings: {
        originium_ore: { machineId: 'miner_3', overclock: rational(125) },
      },
      checkedDerived: new Set([resourceOwner('originium_ore')]),
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
      expect(input.value).toBe('560');

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
      resourceRecipeSettings: { originium_ore: { machineId: 'miner' } },
      checkedDerived: new Set([resourceOwner('originium_ore')]),
    });
    const before = store.state();
    const exclusions = settingsStore.settings().excludedRecipeIds;
    button('endfield.resources.presetTundra').click();
    expectRates({
      originium_ore: 560,
      quartz_sand: 240,
      iron_ore: 1080,
      copper_ore: 0,
      gas_xiranite: 0,
      gas_inert: 0,
    });
    expect(store.state().resourceLimits.enabled).toBeTrue();
    expect(store.state().machineLimits).toEqual({
      enabled: false,
      limits: { [ovenId]: rational(12) },
    });
    expect(store.state().transfer).toEqual({
      enabled: false,
      source: 'tundra',
    });
    expect(store.state().electric).toEqual(rational(2));
    expect(store.state().resourceRecipeSettings).toEqual({});
    expect(store.state().checkedDerived.size).toBe(0);
    expect(before.resourceRecipeSettings.originium_ore?.machineId).toBe(
      'miner',
    );
    expect(
      before.checkedDerived.has(resourceOwner('originium_ore')),
    ).toBeTrue();
    expect(settingsStore.settings().locationIds).toEqual(new Set(['tundra']));
    expect(settingsStore.settings().excludedRecipeIds).toBe(exclusions);
    expect(settingsStore.settings().otherPreference).toBe('keep');
  });

  it('applies all Jinlong rates and clears restrictions without changing unrelated settings', () => {
    store.set({
      ...createEndfieldState(),
      electric: rational(3),
      resourceRecipeSettings: { iron_ore: { machineId: 'miner' } },
      checkedDerived: new Set([resourceOwner('iron_ore')]),
    });
    button('endfield.resources.presetJinlong').click();
    expectRates({
      originium_ore: 540,
      quartz_sand: 0,
      iron_ore: 120,
      copper_ore: 510,
      gas_xiranite: 150,
      gas_inert: 460,
    });
    expect(store.state().resourceLimits.enabled).toBeTrue();
    expect(store.state().machineLimits).toEqual({
      enabled: true,
      limits: { [ovenId]: rational(12) },
    });
    expect(store.state().transfer).toEqual({ enabled: true, source: 'tundra' });
    expect(store.state().electric).toEqual(rational(3));
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
    });
    expect(settingsStore.settings().locationIds).toEqual(defaults);
    expect(settingsStore.settings().locationIds).not.toBe(defaults);
    expect(settingsStore.settings().excludedRecipeIds).toEqual(
      new Set(['unrelated']),
    );
    expect(settingsStore.settings().otherPreference).toBe('keep');
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

  it('gates every edit during restore and exposes errors and the original URL', async () => {
    const ticket = lifecycle.begin('/aef/list?z=bad&v=11');
    lifecycle.fail(ticket, ['Unable to restore']);
    const before = store.state();
    const settingsBefore = settingsStore.settings();
    const apply = spyOn(settingsStore, 'apply').and.callThrough();
    fixture.componentInstance['applyPreset']('jinlong');
    fixture.componentInstance['clear']();
    fixture.componentInstance['setResourceEnabled'](true);
    fixture.componentInstance['updateRate']('iron_ore', rational(60));
    fixture.componentInstance['setMachineEnabled'](true);
    fixture.componentInstance['updateMachineLimit'](rational(8));
    fixture.componentInstance['setTransferEnabled'](true);
    fixture.componentInstance['setWaterDisabled'](false);
    expect(store.state()).toBe(before);
    expect(settingsStore.settings()).toBe(settingsBefore);
    expect(apply).not.toHaveBeenCalled();

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    expect(html.textContent).toContain('endfield.recovery.preferences');
    expect(html.textContent).toContain('Unable to restore');
    expect(html.querySelector('textarea')?.value).toBe('/aef/list?z=bad&v=11');
    expect(button('endfield.resources.presetTundra').disabled).toBeTrue();
    expect(
      [
        ...html.querySelectorAll('lab-checkbox input, lab-input-number input'),
      ].filter((element) => !(element as HTMLInputElement).disabled),
    ).toEqual([]);
    expect(button('endfield.recovery.downloadPreferences')).toBeDefined();
  });

  it('exposes the resource accordion expanded state', () => {
    const accordionButton = fixture.nativeElement.querySelector(
      'lab-accordion-item button',
    ) as HTMLButtonElement;
    expect(accordionButton.getAttribute('aria-expanded')).toBe('true');
  });

  it('prevents enabling a Tundra self-transfer while allowing an existing transfer to be disabled', async () => {
    settingsStore.settings.update((value) => ({
      ...value,
      locationIds: new Set(['tundra']),
    }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance['onlyTundra']()).toBeTrue();
    expect(checkbox(2).disabled).toBeTrue();
    fixture.componentInstance['setTransferEnabled'](true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(checkbox(2).disabled).toBeFalse();
    expect(checkbox(2).checked).toBeTrue();
    checkbox(2).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.state().transfer).toEqual({
      enabled: false,
      source: 'tundra',
    });
    expect(checkbox(2).checked).toBeFalse();
    expect(checkbox(2).disabled).toBeTrue();
  });

  it('shows Tundra as the read-only transfer source and enables transfer', () => {
    settingsStore.settings.update((value) => ({
      ...value,
      locationIds: new Set(['jinlong']),
    }));
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    expect(html.querySelector('lab-select')).toBeNull();
    expect(html.textContent).toContain('endfield.resources.transferSource');
    expect(html.textContent).toContain('endfield.resources.tundra');
    expect(checkbox(2).disabled).toBeFalse();
    checkbox(2).click();
    expect(store.state().transfer).toEqual({ enabled: true, source: 'tundra' });
  });

  it('exports the current failed workspace URL unchanged', () => {
    lifecycle.begin('/aef/list?z=bad&v=11');
    fixture.detectChanges();
    const download = spyOn(
      fixture.componentInstance as unknown as {
        download: (name: string, value: string) => void;
      },
      'download',
    );
    button('endfield.recovery.downloadUrl').click();
    expect(download).toHaveBeenCalledOnceWith(
      'endfield-original-url.txt',
      '/aef/list?z=bad&v=11',
    );
  });

  it('exports the original preference bytes and name when clicked', async () => {
    const raw = '{"theme":"black"}';
    const download = spyOn(
      fixture.componentInstance as unknown as {
        download: (name: string, value: string) => void;
      },
      'download',
    ).and.callThrough();
    const create = spyOn(URL, 'createObjectURL').and.returnValue(
      'blob:recovery-test',
    );
    jasmine.clock().install();
    try {
      button('endfield.recovery.downloadPreferences').click();
      expect(download).toHaveBeenCalledOnceWith('preferences.json', raw);
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      jasmine.clock().uninstall();
    }
    const blob = create.calls.mostRecent().args[0] as Blob;
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      new TextEncoder().encode(raw),
    );
  });
});

describe('EndfieldResources preference recovery integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  for (const [label, raw] of [
    ['malformed JSON', '{"states":'],
    ['empty text', ''],
  ]) {
    it(`exports ${label} without writing preferences`, async () => {
      localStorage.setItem('preferences', raw);
      await TestBed.configureTestingModule({
        imports: [TestModule, EndfieldResources],
        providers: [{ provide: SettingsStore, useValue: createSettings() }],
      }).compileComponents();
      const fixture = TestBed.createComponent(EndfieldResources);
      fixture.detectChanges();
      const html: HTMLElement = fixture.nativeElement;
      expect(TestBed.inject(PreferencesStore).restoreError()).toBeDefined();
      expect(html.textContent).toContain('endfield.recovery.preferences');
      const download = spyOn(
        fixture.componentInstance as unknown as {
          download: (name: string, value: string) => void;
        },
        'download',
      );
      const button = [...html.querySelectorAll('button')].find((element) =>
        element.textContent?.includes('endfield.recovery.downloadPreferences'),
      );
      expect(button).toBeDefined();
      button!.click();
      expect(download).toHaveBeenCalledOnceWith('preferences.json', raw);
      TestBed.tick();
      expect(localStorage.getItem('preferences')).toBe(raw);
    });
  }
});
