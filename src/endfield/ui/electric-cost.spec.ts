import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { CostSettingsDialog } from '~/app/main/settings/cost-settings-dialog/cost-settings-dialog';
import { Button } from '~/components/button/button';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';
import { assert } from '~/tests/utils';

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
    fixture.componentInstance.apply('surplus', undefined);
    expect(
      fixture.componentInstance['editValue']().surplus.eq(rational(4)),
    ).toBeTrue();
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

  it('preserves both drafts across resource, region and language changes and saves them together', () => {
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

    const equivalentElectric = rational(4, 2);
    expect(equivalentElectric).not.toBe(endfield.state().electric);
    endfield.set({
      ...endfield.state(),
      electric: equivalentElectric,
      resourceLimits: { ...endfield.state().resourceLimits, enabled: true },
    });
    fixture.detectChanges();
    expect(
      fixture.componentInstance['editValue']().surplus.eq(rational(5)),
    ).toBeTrue();
    expect(
      fixture.componentInstance['editElectric']().eq(rational(3)),
    ).toBeTrue();

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
    fixture.detectChanges();
    expect(component['editValue']().surplus.eq(rational(5))).toBeTrue();
    expect(component['editElectric']()?.eq(rational(3))).toBeTrue();
    click('ok');
    expect(settings.state().costs.surplus.eq(rational(5))).toBeTrue();
    expect(endfield.state().electric.eq(rational(3))).toBeTrue();
    expect(endfield.state().resourceLimits.enabled).toBeTrue();
  });

  for (const changed of ['ordinary', 'electric'] as const) {
    it(`refreshes both drafts when the committed ${changed} cost changes`, () => {
      const component = fixture.componentInstance;
      component.apply('surplus', rational(5));
      component.applyElectric(rational(3));
      if (changed === 'ordinary')
        settings.apply({
          costs: { ...settings.state().costs, surplus: rational(7) },
        });
      else endfield.set({ ...endfield.state(), electric: rational(6) });
      fixture.detectChanges();
      expect(
        component['editValue']().surplus.eq(
          rational(changed === 'ordinary' ? 7 : 4),
        ),
      ).toBeTrue();
      expect(
        component['editElectric']().eq(
          rational(changed === 'electric' ? 6 : 2),
        ),
      ).toBeTrue();
    });
  }
});
