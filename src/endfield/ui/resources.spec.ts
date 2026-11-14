import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { WorkspaceLifecycle } from '~/state/workspace-lifecycle';
import { TestModule } from '~/tests/test-module';

import { createEndfieldState } from '../domain/model';
import { EndfieldCoordinator } from '../state/coordinator';
import { EndfieldResources, perMinute, perSecond } from './resources';

describe('EndfieldResources', () => {
  let fixture: ComponentFixture<EndfieldResources>;
  const ready = signal(true);
  const errors = signal(['Unable to restore']);
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
          useValue: { errors, originalInput },
        },
        {
          provide: PreferencesStore,
          useValue: {
            restoreError: signal('Unable to restore preferences'),
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

  it('disables editing during restore and exposes errors and the original URL', async () => {
    ready.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    expect(html.textContent).toContain('endfield.recovery.preferences');
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

  it('exports the current failed workspace URL unchanged', () => {
    ready.set(false);
    fixture.detectChanges();
    const download = spyOn(
      fixture.componentInstance as unknown as {
        download: (name: string, value: string) => void;
      },
      'download',
    );
    const button = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ].find((element) =>
      element.textContent?.includes('endfield.recovery.downloadUrl'),
    );
    expect(button).toBeDefined();
    button!.click();
    expect(download).toHaveBeenCalledOnceWith(
      'endfield-original-url.txt',
      '/aef/list?z=bad&v=11',
    );
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
    it(`exports ${label} without writing or listing old backups`, async () => {
      localStorage.setItem('preferences', raw);
      localStorage.setItem('preferences.recovery.1', 'old backup');
      localStorage.setItem('endfield.presentation', 'old display');
      await TestBed.configureTestingModule({
        imports: [TestModule, EndfieldResources],
        providers: [
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
            useValue: { errors: signal([]), originalInput: signal('') },
          },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(EndfieldResources);
      fixture.detectChanges();
      const html: HTMLElement = fixture.nativeElement;
      expect(TestBed.inject(PreferencesStore).restoreError()).toBeDefined();
      expect(html.textContent).toContain('endfield.recovery.preferences');
      expect(html.textContent).not.toContain('preferences.recovery.1');
      expect(html.textContent).not.toContain('endfield.presentation');
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
      expect(localStorage.getItem('preferences.recovery.1')).toBe('old backup');
      expect(localStorage.getItem('endfield.presentation')).toBe('old display');
    });
  }
});
