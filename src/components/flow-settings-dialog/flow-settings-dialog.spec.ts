import { ComponentFixture, TestBed } from '@angular/core/testing';

import { createEndfieldProduct } from '~/endfield/product/product';
import { PRODUCT_PROFILE } from '~/extensions/product-profile';
import { FlowDiagram } from '~/state/preferences/flow-diagram';
import { initialPreferencesState } from '~/state/preferences/preferences-state';
import { TestModule } from '~/tests/test-module';

import { FlowSettingsDialog } from './flow-settings-dialog';

describe('FlowSettingsDialog', () => {
  let component: FlowSettingsDialog;
  let fixture: ComponentFixture<FlowSettingsDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, FlowSettingsDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(FlowSettingsDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('apply', () => {
    it('should update the editValue', () => {
      component.apply({ diagram: FlowDiagram.BoxLine });
      expect(component['editValue']().diagram).toEqual(FlowDiagram.BoxLine);
    });
  });

  describe('reset', () => {
    it('should reset the editValue', () => {
      spyOn(component['editValue'], 'set');
      component.reset();
      expect(component['editValue'].set).toHaveBeenCalledWith(
        initialPreferencesState.flowSettings,
      );
    });
  });

  describe('save', () => {
    it('should apply the editValue and close the dialog', () => {
      spyOn(component['preferencesStore'], 'apply');
      spyOn(component['dialogRef'], 'close');
      component.save();
      expect(component['preferencesStore'].apply).toHaveBeenCalled();
      expect(component['dialogRef'].close).toHaveBeenCalled();
    });
  });
});

describe('FlowSettingsDialog with Endfield product', () => {
  it('uses BoxLine for reset and modified', async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TestModule, FlowSettingsDialog],
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(false, 'zh'),
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(FlowSettingsDialog);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component['modified']()).toBeFalse();
    component.apply({ diagram: FlowDiagram.Sankey });
    expect(component['modified']()).toBeTrue();
    component.reset();
    expect(component['editValue']().diagram).toBe(FlowDiagram.BoxLine);
    expect(component['modified']()).toBeFalse();
    localStorage.clear();
  });
});
