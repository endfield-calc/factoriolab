import { HttpTestingController } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { CostSettingsDialog } from '~/app/main/settings/cost-settings-dialog/cost-settings-dialog';
import { Button } from '~/components/button/button';
import { Modules } from '~/components/modules/modules';
import { provideEndfield } from '~/endfield/providers';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { WorkspaceLifecycle } from '~/state/workspace-lifecycle';
import { ItemId } from '~/tests/item-id';
import { mockModI18n } from '~/tests/mocks/data';
import { mockModuleSettings } from '~/tests/mocks/settings';
import { TestModule } from '~/tests/test-module';
import { assert, setInputs } from '~/tests/utils';

function preservePreferences(): () => void {
  const previous = localStorage.getItem('preferences');
  localStorage.removeItem('preferences');
  return (): void => {
    TestBed.resetTestingModule();
    if (previous == null) localStorage.removeItem('preferences');
    else localStorage.setItem('preferences', previous);
  };
}

function isolatePreferences(): void {
  let restore: () => void;
  beforeEach(() => {
    restore = preservePreferences();
  });
  afterEach(() => {
    restore();
  });
}

describe('CostSettingsDialog with Endfield defaults', () => {
  isolatePreferences();
  let fixture: ComponentFixture<CostSettingsDialog>;
  let settings: SettingsStore;
  let endfield: EndfieldStore;

  function open(): void {
    fixture = TestBed.createComponent(CostSettingsDialog);
    fixture.detectChanges();
  }

  function click(name: string): void {
    const button = fixture.debugElement
      .queryAll(By.directive(Button))
      .find((element) => (element.componentInstance as Button).text() === name);
    assert(button != null);
    (button.nativeElement as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  function edit(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, CostSettingsDialog],
      providers: provideEndfield(),
    }).compileComponents();
    settings = TestBed.inject(SettingsStore);
    endfield = TestBed.inject(EndfieldStore);
    settings.apply({
      costs: { ...settings.settings().costs, surplus: rational(4) },
    });
    endfield.set({ ...endfield.state(), electric: rational(2) });
    open();
  });

  it('keeps both committed values on Reset then Cancel and applies both on Reset then OK', () => {
    const close = spyOn(fixture.componentInstance['dialogRef'], 'close');
    click('reset');
    expect(
      fixture.componentInstance['editValue']().surplus.eq(rational.one),
    ).toBeTrue();
    expect(
      fixture.componentInstance['editElectric']()?.eq(rational.one),
    ).toBeTrue();
    expect(settings.settings().costs.surplus.eq(rational(4))).toBeTrue();
    expect(endfield.state().electric.eq(rational(2))).toBeTrue();
    click('cancel');
    expect(close).toHaveBeenCalled();
    fixture.destroy();

    open();
    expect(
      fixture.componentInstance['editValue']().surplus.eq(rational(4)),
    ).toBeTrue();
    expect(
      fixture.componentInstance['editElectric']()?.eq(rational(2)),
    ).toBeTrue();
    click('reset');
    click('ok');
    expect(settings.settings().costs.surplus.eq(rational.one)).toBeTrue();
    expect(endfield.state().electric.eq(rational.one)).toBeTrue();
  });

  it('saves valid edits to both stores together and rejects a negative electric weight', () => {
    const html: HTMLElement = fixture.nativeElement;
    const row = html.querySelector('#cost-surplus')?.parentElement;
    const surplus = row?.querySelector<HTMLInputElement>('td input');
    const electric = html.querySelector<HTMLInputElement>(
      'lab-form-field lab-input-number input',
    );
    assert(surplus != null && electric != null);
    edit(surplus, '5');
    edit(electric, '3/2');
    expect(settings.settings().costs.surplus.eq(rational(4))).toBeTrue();
    expect(endfield.state().electric.eq(rational(2))).toBeTrue();
    edit(electric, '-1');
    expect(
      fixture.componentInstance['editElectric']()?.eq(rational(3, 2)),
    ).toBeTrue();
    click('ok');
    expect(settings.settings().costs.surplus.eq(rational(5))).toBeTrue();
    expect(endfield.state().electric.eq(rational(3, 2))).toBeTrue();
  });

  it('accepts negative and zero ordinary costs and a zero electric weight', () => {
    const html = fixture.nativeElement as HTMLElement;
    const input = (key: string): HTMLInputElement => {
      const value = html
        .querySelector(`#cost-${key}`)
        ?.parentElement?.querySelector<HTMLInputElement>('td input');
      assert(value != null);
      return value;
    };
    const electric = html.querySelector<HTMLInputElement>(
      'lab-form-field lab-input-number input',
    );
    assert(electric != null);
    edit(input('surplus'), '-2');
    edit(input('machine'), '0');
    edit(electric, '0');
    click('ok');
    expect(settings.state().costs.surplus.eq(rational(-2))).toBeTrue();
    expect(settings.state().costs.machine.eq(rational.zero)).toBeTrue();
    expect(endfield.state().electric.eq(rational.zero)).toBeTrue();
  });

  it('rejects an invalid draft before writing either store', () => {
    const component = fixture.componentInstance;
    const close = spyOn(component['dialogRef'], 'close');
    component['draft'].set({
      costs: { ...settings.state().costs, surplus: rational(9) },
      electric: rational(-1),
    });
    component.save();
    expect(settings.state().costs.surplus.eq(rational(4))).toBeTrue();
    expect(endfield.state().electric.eq(rational(2))).toBeTrue();
    expect(close).not.toHaveBeenCalled();
  });

  it('ignores an invalid cost edit and rejects an invalid cost draft before writing', () => {
    const component = fixture.componentInstance;
    const close = spyOn(component['dialogRef'], 'close');
    component.apply('surplus', undefined);
    expect(component['editValue']().surplus.eq(rational(4))).toBeTrue();
    component['draft'].set({
      costs: { ...settings.state().costs, surplus: undefined as never },
      electric: rational(3),
    });
    component.save();
    expect(settings.state().costs.surplus.eq(rational(4))).toBeTrue();
    expect(endfield.state().electric.eq(rational(2))).toBeTrue();
    expect(close).not.toHaveBeenCalled();
  });

  it('keeps a power draft when another extension field changes', () => {
    const component = fixture.componentInstance;
    component.apply('surplus', rational(5));
    component.applyElectric(rational(3));
    endfield.set({
      ...endfield.state(),
      resourceLimits: { ...endfield.state().resourceLimits, enabled: true },
    });
    fixture.detectChanges();
    expect(component['editValue']().surplus.eq(rational(5))).toBeTrue();
    expect(component['editElectric']()?.eq(rational(3))).toBeTrue();
    component.save();
    expect(settings.settings().costs.surplus.eq(rational(5))).toBeTrue();
    expect(endfield.state().electric.eq(rational(3))).toBeTrue();
    expect(endfield.state().resourceLimits.enabled).toBeTrue();
  });

  it('preserves both drafts across region and language changes and saves them together', () => {
    const html: HTMLElement = fixture.nativeElement;
    const surplus = html
      .querySelector('#cost-surplus')
      ?.parentElement?.querySelector<HTMLInputElement>('td input');
    const electric = html.querySelector<HTMLInputElement>(
      'lab-form-field lab-input-number input',
    );
    assert(surplus != null && electric != null);
    edit(surplus, '5');
    edit(electric, '3');

    const beforeRegion = settings.settings();
    settings.apply({ locationIds: new Set(['tundra']) });
    expect(settings.settings()).not.toBe(beforeRegion);
    expect(settings.state().locationIds).toEqual(new Set(['tundra']));
    const component = fixture.componentInstance;
    expect(component['editValue']().surplus.eq(rational(5))).toBeTrue();
    expect(component['editElectric']()?.eq(rational(3))).toBeTrue();

    const preferences = TestBed.inject(PreferencesStore);
    preferences.apply({ language: 'zh' });
    expect(preferences.language()).toBe('zh');
    settings['modI18nResource'].set(mockModI18n);
    expect(settings.dataset().itemRecord[ItemId.IronOre].name).toBe(
      mockModI18n.items[ItemId.IronOre],
    );
    fixture.detectChanges();
    expect(component['editValue']().surplus.eq(rational(5))).toBeTrue();
    expect(component['editElectric']()?.eq(rational(3))).toBeTrue();
    click('ok');
    expect(settings.state().costs.surplus.eq(rational(5))).toBeTrue();
    expect(endfield.state().electric.eq(rational(3))).toBeTrue();
  });

  it('restores preference storage before a later Modules fixture is created', async () => {
    TestBed.resetTestingModule();
    const original = '{ "language": "en", "theme": "dark" }';
    localStorage.setItem('preferences', original);
    const restore = preservePreferences();
    await TestBed.configureTestingModule({
      imports: [TestModule, CostSettingsDialog],
      providers: provideEndfield(),
    }).compileComponents();
    const cost = TestBed.createComponent(CostSettingsDialog);
    cost.detectChanges();
    TestBed.inject(PreferencesStore).apply({ language: 'zh' });
    TestBed.tick();
    expect(localStorage.getItem('preferences')).toContain('"language":"zh"');
    TestBed.resetTestingModule();

    async function createModules(): Promise<ComponentFixture<Modules>> {
      await TestBed.configureTestingModule({
        imports: [TestModule, Modules],
      }).compileComponents();
      const next = TestBed.createComponent(Modules);
      setInputs(next, {
        entity:
          TestBed.inject(SettingsStore).dataset().machineRecord[
            ItemId.AssemblingMachine3
          ],
        value: mockModuleSettings,
      });
      next.detectChanges();
      TestBed.tick();
      return next;
    }

    await createModules();
    expect(TestBed.inject(PreferencesStore).language()).toBe('zh');
    TestBed.inject(HttpTestingController).expectNone((request) =>
      request.url.startsWith('data/2.0/'),
    );
    restore();
    expect(localStorage.getItem('preferences')).toBe(original);

    const next = await createModules();
    expect(TestBed.inject(PreferencesStore).language()).toBe('en');
    next.componentInstance['removeEntry'](0);
    expect(next.componentInstance.value()).toHaveSize(1);
    TestBed.inject(HttpTestingController).expectNone((request) =>
      request.url.startsWith('data/2.0/i18n/'),
    );
    await TestBed.inject(ApplicationRef).whenStable();
  });

  it('refreshes both drafts when a committed ordinary cost changes', () => {
    const component = fixture.componentInstance;
    component.apply('surplus', rational(5));
    component.applyElectric(rational(3));
    settings.apply({
      costs: { ...settings.state().costs, surplus: rational(7) },
    });
    fixture.detectChanges();
    expect(component['editValue']().surplus.eq(rational(7))).toBeTrue();
    expect(component['editElectric']()?.eq(rational(2))).toBeTrue();
  });

  it('refreshes both drafts when the committed electric cost changes', () => {
    const component = fixture.componentInstance;
    component.apply('surplus', rational(5));
    component.applyElectric(rational(3));
    endfield.set({ ...endfield.state(), electric: rational(6) });
    fixture.detectChanges();
    expect(component['editValue']().surplus.eq(rational(4))).toBeTrue();
    expect(component['editElectric']()?.eq(rational(6))).toBeTrue();
  });

  it('preserves both drafts during recovery and refreshes both when it completes', () => {
    const component = fixture.componentInstance;
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    component.apply('surplus', rational(5));
    component.applyElectric(rational(3));
    const ticket = lifecycle.begin('?restoring');
    fixture.detectChanges();
    settings.apply({
      costs: { ...settings.state().costs, surplus: rational(8) },
    });
    endfield.set({ ...endfield.state(), electric: rational(2) });
    fixture.detectChanges();
    expect(component['editValue']().surplus.eq(rational(5))).toBeTrue();
    expect(component['editElectric']()?.eq(rational(3))).toBeTrue();

    lifecycle.complete(ticket);
    fixture.detectChanges();
    expect(component['editValue']().surplus.eq(rational(8))).toBeTrue();
    expect(component['editElectric']()?.eq(rational(2))).toBeTrue();
    click('cancel');
    expect(settings.state().costs.surplus.eq(rational(8))).toBeTrue();
    expect(endfield.state().electric.eq(rational(2))).toBeTrue();
  });

  it('refreshes both drafts when a recovery completes without changing either committed cost', () => {
    const component = fixture.componentInstance;
    component.apply('surplus', rational(5));
    component.applyElectric(rational(3));
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    lifecycle.complete(lifecycle.begin('?restoring'));
    expect(component['editValue']().surplus.eq(rational(4))).toBeTrue();
    expect(component['editElectric']()?.eq(rational(2))).toBeTrue();
  });

  it('initializes from committed costs if opened while recovery is active', () => {
    TestBed.inject(WorkspaceLifecycle).begin('?restoring');
    const duringRecovery = TestBed.createComponent(CostSettingsDialog);
    duringRecovery.detectChanges();
    expect(
      duringRecovery.componentInstance['editValue']().surplus.eq(rational(4)),
    ).toBeTrue();
    expect(
      duringRecovery.componentInstance['editElectric']()?.eq(rational(2)),
    ).toBeTrue();
  });

  it('blocks both Reset and OK while workspace recovery is active', async () => {
    const component = fixture.componentInstance;
    const close = spyOn(component['dialogRef'], 'close');
    component.apply('surplus', rational(6));
    component.applyElectric(rational(3));
    TestBed.inject(WorkspaceLifecycle).begin('?recovering');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    component.reset();
    component.save();
    expect(component['editValue']().surplus.eq(rational(6)))
      .withContext('ordinary cost draft remains unchanged')
      .toBeTrue();
    expect(component['editElectric']()?.eq(rational(3)))
      .withContext('power cost draft remains unchanged')
      .toBeTrue();
    expect(settings.settings().costs.surplus.eq(rational(4)))
      .withContext('ordinary cost store remains unchanged')
      .toBeTrue();
    expect(endfield.state().electric.eq(rational(2)))
      .withContext('power cost store remains unchanged')
      .toBeTrue();
    expect(close).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('lab-form-field input')
        ?.hasAttribute('disabled'),
    )
      .withContext('power cost input is disabled')
      .toBeTrue();
  });
});

describe('CostSettingsDialog native defaults', () => {
  isolatePreferences();
  it('compares rational values and resets to the native costs', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, CostSettingsDialog],
    }).compileComponents();
    const fixture = TestBed.createComponent(CostSettingsDialog);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.apply('unproduceable', rational(100000000));
    expect(component['modified']()).toBeFalse();
    component.apply('recycling', rational(1000));
    expect(component['modified']()).toBeTrue();
    component.apply('recycling', rational.one);
    expect(component['modified']()).toBeFalse();
    component.apply('surplus', rational.zero);
    expect(component['modified']()).toBeTrue();
    component.reset();
    expect(component['editValue']().surplus.eq(rational.one)).toBeTrue();
    expect(
      component['editValue']().unproduceable.eq(rational(100000000)),
    ).toBeTrue();
    expect(component['editValue']().recycling.eq(rational.one)).toBeTrue();
    expect(component['modified']()).toBeFalse();
  });
});
