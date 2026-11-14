import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CostSettingsDialog } from '~/app/main/settings/cost-settings-dialog/cost-settings-dialog';
import { createEndfieldProduct } from '~/endfield/product/product';
import { provideEndfield } from '~/endfield/providers';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { PRODUCT_PROFILE } from '~/extensions/product-profile';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { rational } from '~/rational/rational';
import { TestModule } from '~/tests/test-module';

import { createEndfieldState } from '../domain/model';
import { EndfieldCoordinator } from '../state/coordinator';
import { EndfieldElectricCost } from './electric-cost';

describe('EndfieldElectricCost', () => {
  it('applies the independent power weight only when explicitly applied', async () => {
    const state = signal(createEndfieldState());
    const dispatch = jasmine.createSpy('dispatch').and.returnValue(true);
    await TestBed.configureTestingModule({
      imports: [TestModule, EndfieldElectricCost],
      providers: [
        {
          provide: EndfieldCoordinator,
          useValue: { state, ready: signal(true), dispatch },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EndfieldElectricCost);
    fixture.detectChanges();
    fixture.componentInstance['updateValue'](rational(3, 2));
    fixture.detectChanges();
    expect(dispatch).not.toHaveBeenCalled();
    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[buttons.length - 1].click();
    expect(
      dispatch.calls.mostRecent().args[0].value.eq(rational(3, 2)),
    ).toBeTrue();
  });
});

describe('CostSettingsDialog with Endfield product', () => {
  it('offers Reset for an independent power weight and restores all effective costs', async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TestModule, CostSettingsDialog],
      providers: provideEndfield(),
    }).compileComponents();
    const store = TestBed.inject(EndfieldStore);
    const fixture = TestBed.createComponent(CostSettingsDialog);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const initialButtons = element.querySelectorAll('button').length;
    store.set({ ...store.state(), electric: rational(2) });
    fixture.detectChanges();
    expect(component['modified']()).toBeTrue();
    expect(element.querySelectorAll('button').length).toBe(initialButtons + 1);
    component.apply('surplus', rational.zero);
    component.reset();
    fixture.detectChanges();
    expect(store.state().electric.eq(rational.one)).toBeTrue();
    expect(component['editValue']().surplus.eq(rational.one)).toBeTrue();
    expect(component['modified']()).toBeFalse();
    localStorage.clear();
  });

  it('does not reset or save an open editor during workspace restoration', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, CostSettingsDialog],
    }).compileComponents();
    const fixture = TestBed.createComponent(CostSettingsDialog);
    const component = fixture.componentInstance;
    const apply = spyOn(component['settingsStore'], 'apply');
    const resetCosts = spyOn(component['presentation'], 'resetCosts');
    const close = spyOn(component['dialogRef'], 'close');
    component.apply('surplus', rational.zero);
    TestBed.inject(WorkspaceLifecycle).begin('?recovering');
    component.reset();
    component.save();
    expect(component['editValue']().surplus.eq(rational.zero)).toBeTrue();
    expect(resetCosts).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('compares rational values and resets to the effective product costs', async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TestModule, CostSettingsDialog],
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(false, 'zh'),
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CostSettingsDialog);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.apply('unproduceable', rational(1000000));
    expect(component['modified']()).toBeFalse();
    component.apply('surplus', rational.zero);
    expect(component['modified']()).toBeTrue();
    component.reset();
    expect(component['editValue']().surplus.eq(rational.one)).toBeTrue();
    expect(component['editValue']().recycling.eq(rational(1000))).toBeTrue();
    expect(component['modified']()).toBeFalse();
    localStorage.clear();
  });
});
