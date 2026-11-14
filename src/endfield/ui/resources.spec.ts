import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { TestModule } from '~/tests/test-module';

import { createEndfieldState } from '../domain/model';
import { EndfieldCoordinator } from '../state/coordinator';
import { EndfieldResources, perMinute, perSecond } from './resources';

describe('EndfieldResources', () => {
  let fixture: ComponentFixture<EndfieldResources>;
  const ready = signal(true);
  const diagnostics = signal([
    { code: 'bad', message: 'Unable to restore', severity: 'error' as const },
  ]);
  const originalInput = signal('/aef/list?z=bad&v=11');
  const state = signal(createEndfieldState());
  const settings = signal({
    locationIds: new Set(['tundra']),
    excludedRecipeIds: new Set<string>(),
  });
  const dispatch = jasmine.createSpy('dispatch').and.returnValue(true);

  beforeEach(async () => {
    ready.set(true);
    state.set(createEndfieldState());
    settings.set({
      locationIds: new Set(['tundra']),
      excludedRecipeIds: new Set<string>(),
    });
    dispatch.calls.reset();
    await TestBed.configureTestingModule({
      imports: [TestModule, EndfieldResources],
      providers: [
        {
          provide: EndfieldCoordinator,
          useValue: {
            ready,
            state,
            settings,
            data: signal({ itemRecord: {} }),
            diagnostics: signal([]),
            dispatch,
          },
        },
        {
          provide: WorkspaceLifecycle,
          useValue: { diagnostics, originalInput },
        },
        {
          provide: PreferencesStore,
          useValue: {
            migrationWarnings: ['Theme black was renamed dark'],
            stored: (): string => '{"theme":"black"}',
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EndfieldResources);
    fixture.detectChanges();
  });

  it('converts displayed per-minute values exactly to per-second commands', () => {
    expect(perMinute(rational(3, 2)).eq(rational(90))).toBeTrue();
    expect(perSecond(rational(1)).eq(rational(1, 60))).toBeTrue();
    fixture.componentInstance['updateRate']('originium_ore', rational(90));
    const action = dispatch.calls.mostRecent().args[0];
    expect(action.type).toBe('resourceRate');
    expect(action.value.eq(rational(3, 2))).toBeTrue();
  });

  it('ignores empty editor values and dispatches physical machine counts unchanged', () => {
    fixture.componentInstance['updateRate']('iron_ore', undefined);
    fixture.componentInstance['updateMachineLimit'](undefined);
    expect(dispatch).not.toHaveBeenCalled();
    fixture.componentInstance['updateMachineLimit'](rational(12));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'machineLimit',
      id: 'xiranite_oven_1',
      value: rational(12),
    });
  });

  it('disables editing during restore and exposes warnings and the original URL', async () => {
    ready.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    expect(html.textContent).toContain('Theme black was renamed dark');
    expect(html.textContent).toContain('Unable to restore');
    expect(html.querySelector('textarea')?.value).toBe('/aef/list?z=bad&v=11');
    const buttons = [...html.querySelectorAll('button')];
    const preset = buttons.find((button) =>
      button.textContent?.includes('endfield.resources.presetTundra'),
    );
    expect(preset?.disabled).toBeTrue();
    expect(
      [...html.querySelectorAll('lab-checkbox input, lab-input-number input')]
        .filter((element) => !(element as HTMLInputElement).disabled)
        .map((element) => element.parentElement?.parentElement?.outerHTML),
    ).toEqual([]);
    expect(
      buttons.some((button) =>
        button.textContent?.includes('endfield.recovery.downloadPreferences'),
      ),
    ).toBeTrue();
  });

  it('exposes the resource accordion expanded state', () => {
    const button = fixture.nativeElement.querySelector(
      'lab-accordion-item button',
    ) as HTMLButtonElement;
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps resource controls within a 390px workspace', async () => {
    const host: HTMLElement = fixture.nativeElement;
    host.style.width = '382px';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
  });

  it('disallows newly enabling transfer from its sole selected region', () => {
    expect(fixture.componentInstance['onlyTundra']()).toBeTrue();
    const checkbox = fixture.nativeElement.querySelectorAll(
      'lab-checkbox',
    )[2] as HTMLElement;
    expect(checkbox.querySelector('input')?.disabled).toBeTrue();
  });

  it('shows Tundra as read-only and preserves it in transfer actions', async () => {
    settings.set({
      locationIds: new Set(['jinlong']),
      excludedRecipeIds: new Set(),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    expect(html.querySelector('lab-select')).toBeNull();
    expect(html.textContent).toContain('endfield.resources.transferSource');
    expect(html.textContent).toContain('endfield.resources.tundra');
    const checkbox = html.querySelectorAll('lab-checkbox')[2];
    const input = checkbox.querySelector('input');
    expect(input?.disabled).toBeFalse();
    input?.click();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'transfer',
      enabled: true,
      source: 'tundra',
    });
  });

  it('recovers all backed-up preference versions and falls back when storage is unavailable', () => {
    spyOnProperty(Storage.prototype, 'length', 'get').and.returnValue(4);
    spyOn(Storage.prototype, 'key').and.callFake(
      (index: number): string | null =>
        [
          'preferences.recovery.1',
          'other',
          'preferences.recovery',
          'preferences.recovery.2',
        ][index] ?? null,
    );
    const get = spyOn(Storage.prototype, 'getItem').and.callFake(
      (key: string): string | null =>
        (
          ({
            'preferences.recovery': 'first',
            'preferences.recovery.1': 'second',
          }) as Record<string, string>
        )[key] ?? null,
    );
    expect(fixture.componentInstance['readBackups']()).toEqual([
      { key: 'preferences', value: '{"theme":"black"}' },
      { key: 'preferences.recovery', value: 'first' },
      { key: 'preferences.recovery.1', value: 'second' },
    ]);
    get.and.throwError('storage unavailable');
    expect(fixture.componentInstance['readBackups']()).toEqual([
      { key: 'preferences', value: '{"theme":"black"}' },
    ]);
    spyOn(fixture.componentInstance['preferences'], 'stored').and.returnValue(
      undefined,
    );
    expect(fixture.componentInstance['readBackups']()).toEqual([]);
  });

  it('discovers display backups even when there are no current warnings', () => {
    fixture.componentInstance['preferences'].migrationWarnings.length = 0;
    spyOnProperty(Storage.prototype, 'length', 'get').and.returnValue(1);
    spyOn(Storage.prototype, 'key').and.returnValue(
      'preferences.recovery.endfield.presentation.2',
    );
    spyOn(Storage.prototype, 'getItem').and.returnValue('damaged display');
    expect(fixture.componentInstance['readBackups']()).toEqual([
      {
        key: 'preferences.recovery.endfield.presentation.2',
        value: 'damaged display',
      },
    ]);
  });

  it('offers the still-readable legacy display original', () => {
    fixture.componentInstance['preferences'].migrationWarnings.length = 0;
    spyOnProperty(Storage.prototype, 'length', 'get').and.returnValue(0);
    spyOn(Storage.prototype, 'getItem').and.callFake(
      (key: string): string | null =>
        key === 'endfield.presentation' ? '{broken' : null,
    );
    expect(fixture.componentInstance['readBackups']()).toEqual([
      { key: 'endfield.presentation', value: '{broken' },
    ]);
  });

  it('does not offer a second copy of an original already present in a recovery backup', () => {
    fixture.componentInstance['preferences'].migrationWarnings.length = 0;
    spyOnProperty(Storage.prototype, 'length', 'get').and.returnValue(1);
    const key = 'preferences.recovery.endfield.presentation';
    spyOn(Storage.prototype, 'key').and.returnValue(key);
    spyOn(Storage.prototype, 'getItem').and.returnValue('{broken');
    expect(fixture.componentInstance['readBackups']()).toEqual([
      { key, value: '{broken' },
    ]);
  });

  it('exports the unmodified original as a local text blob', async () => {
    const create = spyOn(URL, 'createObjectURL').and.returnValue(
      'blob:recovery-test',
    );
    spyOn(URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'dispatchEvent').and.returnValue(true);
    jasmine.clock().install();
    try {
      fixture.componentInstance['download'](
        'preferences.recovery.json',
        '{"theme":"black"}',
      );
      expect(create).toHaveBeenCalled();
      jasmine.clock().tick(40000);
    } finally {
      jasmine.clock().uninstall();
    }
    const blob = create.calls.mostRecent().args[0] as Blob;
    expect(await blob.text()).toBe('{"theme":"black"}');
  });
});

describe('EndfieldResources preference recovery integration', () => {
  const currentKey = 'endfield.presentation';
  const displayBackup = 'preferences.recovery.endfield.presentation';
  const legacyBackup = 'preferences.recovery.97';
  let original: Map<string, string>;
  let set: jasmine.Spy;

  function relevantKeys(): string[] {
    return Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    ).filter(
      (key): key is string =>
        key != null &&
        (key === currentKey ||
          key === legacyBackup ||
          key === displayBackup ||
          key.startsWith(`${displayBackup}.`)),
    );
  }

  beforeEach(() => {
    original = new Map(
      relevantKeys().map((key) => [key, localStorage.getItem(key) ?? '']),
    );
    for (const key of relevantKeys()) localStorage.removeItem(key);
    spyOn(Storage.prototype, 'getItem').and.callThrough();
    set = spyOn(Storage.prototype, 'setItem').and.callThrough();
  });

  afterEach(() => {
    set.and.callThrough();
    TestBed.tick();
    for (const key of relevantKeys()) localStorage.removeItem(key);
    for (const [key, value] of original) localStorage.setItem(key, value);
  });

  async function createFixture(): Promise<ComponentFixture<EndfieldResources>> {
    await TestBed.configureTestingModule({
      imports: [TestModule, EndfieldResources],
      providers: [
        {
          provide: PreferencesStore,
          useValue: {
            migrationWarnings: [],
            stored: (): undefined => undefined,
          },
        },
        {
          provide: EndfieldCoordinator,
          useValue: {
            ready: signal(true),
            state: signal(createEndfieldState()),
            settings: signal({
              locationIds: new Set(['tundra']),
              excludedRecipeIds: new Set(),
            }),
            data: signal({ itemRecord: {} }),
            diagnostics: signal([]),
            dispatch: (): boolean => true,
          },
        },
        {
          provide: WorkspaceLifecycle,
          useValue: { diagnostics: signal([]), originalInput: signal('') },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EndfieldResources);
    fixture.detectChanges();
    return fixture;
  }

  it('discovers real display and legacy backups and exports their original text', async () => {
    const displayRaw = '{ "showNames": true, "hideDuplicateIcons": 4 }';
    const legacyRaw = '{"theme":"black","states":{"aef":{"safe":"v=11"}}}';
    localStorage.setItem(currentKey, displayRaw);
    localStorage.setItem(displayBackup, displayRaw);
    localStorage.setItem(legacyBackup, legacyRaw);
    set.calls.reset();
    const fixture = await createFixture();
    const html: HTMLElement = fixture.nativeElement;
    expect(localStorage.getItem(displayBackup)).toBe(displayRaw);
    expect(localStorage.getItem(currentKey)).toBe(displayRaw);
    expect(
      set.calls
        .allArgs()
        .some(([key]) => key === currentKey || key === displayBackup),
    ).toBeFalse();
    expect(html.textContent).toContain(displayBackup);
    expect(html.textContent).toContain(legacyBackup);
    const spans = [...html.querySelectorAll('section[role="status"] span')];
    const displayButton = spans.find(
      (span) => span.textContent?.trim() === displayBackup,
    )?.previousElementSibling as HTMLButtonElement;
    const legacyButton = spans.find(
      (span) => span.textContent?.trim() === legacyBackup,
    )?.previousElementSibling as HTMLButtonElement;
    expect(displayButton).toBeTruthy();
    expect(legacyButton).toBeTruthy();
    const create = spyOn(URL, 'createObjectURL').and.returnValues(
      'blob:display-test',
      'blob:legacy-test',
    );
    spyOn(URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'dispatchEvent').and.returnValue(true);
    jasmine.clock().install();
    try {
      displayButton.click();
      legacyButton.click();
      jasmine.clock().tick(40000);
    } finally {
      jasmine.clock().uninstall();
    }
    expect(create.calls.count()).toBe(2);
    expect(await (create.calls.argsFor(0)[0] as Blob).text()).toBe(displayRaw);
    expect(await (create.calls.argsFor(1)[0] as Blob).text()).toBe(legacyRaw);
  });

  it('shows previously saved recovery copies even without current warnings', async () => {
    localStorage.setItem(
      currentKey,
      '{"showNames":true,"hideDuplicateIcons":false}',
    );
    localStorage.setItem(`${displayBackup}.3`, 'old display original');
    const fixture = await createFixture();
    const html: HTMLElement = fixture.nativeElement;
    expect(html.textContent).toContain('endfield.recovery.availableBackups');
    expect(html.textContent).toContain(`${displayBackup}.3`);
    expect(html.textContent).not.toContain('endfield.recovery.displayDamaged');
  });

  it('lists multiple saved recovery copies in key order', async () => {
    localStorage.setItem(
      currentKey,
      '{"showNames":true,"hideDuplicateIcons":false}',
    );
    localStorage.setItem(`${displayBackup}.3`, 'new display original');
    localStorage.setItem(displayBackup, 'old display original');
    localStorage.setItem(legacyBackup, 'legacy original');
    const fixture = await createFixture();
    const html: HTMLElement = fixture.nativeElement;
    const backupKeys = [
      ...html.querySelectorAll('section[role="status"] > span'),
    ].map((span) => span.textContent?.trim());
    expect(backupKeys).toEqual([
      currentKey,
      legacyBackup,
      displayBackup,
      `${displayBackup}.3`,
    ]);
  });

  it('keeps an unbacked original readable and exportable without writing it', async () => {
    const raw = '{"showNames":true,"hideDuplicateIcons":"bad"}';
    localStorage.setItem(currentKey, raw);
    set.calls.reset();
    const fixture = await createFixture();
    const html: HTMLElement = fixture.nativeElement;
    expect(html.textContent).toContain('endfield.recovery.availableBackups');
    const span = [...html.querySelectorAll('section[role="status"] span')].find(
      (element) => element.textContent?.trim() === currentKey,
    );
    const button = span?.previousElementSibling as HTMLButtonElement;
    expect(button).toBeTruthy();
    const create = spyOn(URL, 'createObjectURL').and.returnValue(
      'blob:original-test',
    );
    spyOn(URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'dispatchEvent').and.returnValue(true);
    jasmine.clock().install();
    try {
      button.click();
      jasmine.clock().tick(40000);
    } finally {
      jasmine.clock().uninstall();
    }
    expect(await (create.calls.mostRecent().args[0] as Blob).text()).toBe(raw);
    TestBed.tick();
    expect(localStorage.getItem(currentKey)).toBe(raw);
    expect(
      set.calls
        .allArgs()
        .some(([key]) => key === currentKey || key.startsWith(displayBackup)),
    ).toBeFalse();
  });
});
