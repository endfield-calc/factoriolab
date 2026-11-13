import { ComponentFixture, TestBed } from '@angular/core/testing';

import { createEndfieldProduct } from '~/endfield/product/product';
import { PRODUCT_PROFILE } from '~/extensions/product-profile';
import { rational } from '~/rational/rational';
import { initialSettingsState } from '~/state/settings/settings-state';
import { TestModule } from '~/tests/test-module';

import { CostSettingsDialog } from './cost-settings-dialog';

describe('CostSettingsDialog', () => {
  let component: CostSettingsDialog;
  let fixture: ComponentFixture<CostSettingsDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, CostSettingsDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(CostSettingsDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('apply', () => {
    it('should update the editValue signal by the passed key / value pair', () => {
      component.apply('excluded', rational(10n));
      expect(component['editValue']().excluded.eq(rational(10n))).toBeTrue();
    });
  });

  describe('reset', () => {
    it('should reset the edit value to its intial state', () => {
      spyOn(component['editValue'], 'set');
      component.reset();
      expect(component['editValue'].set).toHaveBeenCalledWith(
        initialSettingsState.costs,
      );
    });
  });

  describe('save', () => {
    it('should dispatch the action and close the dialog', () => {
      spyOn(component['settingsStore'], 'apply');
      spyOn(component['dialogRef'], 'close');
      component.save();
      expect(component['settingsStore'].apply).toHaveBeenCalledWith({
        costs: component['editValue'](),
      });
      expect(component['dialogRef'].close).toHaveBeenCalled();
    });
  });
});

describe('CostSettingsDialog with Endfield product', () => {
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
