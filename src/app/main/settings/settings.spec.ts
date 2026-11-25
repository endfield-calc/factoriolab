import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { Icon } from '~/components/icon/icon';
import { rational } from '~/rational/rational';
import { ItemId } from '~/tests/item-id';
import { mockModData } from '~/tests/mocks/data';
import { TestModule } from '~/tests/test-module';
import { Translate } from '~/translate/translate';

import { Settings } from './settings';

describe('Settings', () => {
  let component: Settings;
  let fixture: ComponentFixture<Settings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Settings],
    }).compileComponents();

    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows fixed game information and current dataset versions', () => {
    const store = component['settingsStore'];
    const translate = TestBed.inject(Translate);
    store['modDataResource'].set({
      ...mockModData,
      version: { other: 'v2', 'arknights-endfield': 'v1' },
    });
    translate.data.update((data) => ({
      ...data,
      'options.game.endfield': 'Arknights: Endfield',
    }));

    const accordion = fixture.debugElement.query(By.css('lab-accordion-item'));
    const toggle = accordion.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    expect(toggle.textContent?.trim()).toBe('Game');
    toggle.click();
    fixture.detectChanges();

    const icon = accordion.query(By.directive(Icon));
    expect(icon.componentInstance.value()).toBe('endfield');
    expect(icon.componentInstance.type()).toBe('system');
    expect(
      icon.nativeElement.querySelector('span').style.backgroundImage,
    ).toContain('icons/icons.webp');

    const gameInfo = icon.nativeElement.parentElement as HTMLElement;
    expect(gameInfo.textContent).toContain('Arknights: Endfield');
    expect(
      Array.from(gameInfo.querySelectorAll('small'), (el) =>
        el.textContent?.trim(),
      ),
    ).toEqual(['v1', 'v2']);
    expect(
      gameInfo.querySelector('button, a, input, select, lab-select'),
    ).toBeNull();
    expect(accordion.nativeElement.querySelector('lab-select')).toBeNull();

    store['modDataResource'].set({
      ...mockModData,
      version: { current: 'v3' },
    });
    translate.data.update((data) => ({
      ...data,
      'options.game.endfield': '明日方舟：终末地',
    }));
    fixture.detectChanges();
    expect(gameInfo.textContent).toContain('明日方舟：终末地');
    expect(gameInfo.querySelector('small')?.textContent?.trim()).toBe('v3');
  });

  describe('miningSpeed', () => {
    it('should return the mining bonus plus 100', () => {
      expect(component['miningSpeed']().eq(rational(140n))).toBeTrue();
    });
  });

  describe('setParams', () => {
    it('should call the router to navigate', () => {
      spyOn(component['router'], 'navigateByUrl');
      component.setParams('v=9');
      expect(component['router'].navigateByUrl).toHaveBeenCalled();
    });
  });

  describe('addMachine', () => {
    it('should update the set and pass to the store action, then reset the signal', async () => {
      spyOn(component['settingsStore'], 'updateField');
      component.addMachine(ItemId.AssemblingMachine2);
      expect(component['settingsStore'].updateField).toHaveBeenCalledWith(
        'machineRankIds',
        [
          ItemId.ElectricMiningDrill,
          ItemId.ElectricFurnace,
          ItemId.AssemblingMachine3,
          ItemId.AssemblingMachine2,
        ],
        [
          ItemId.ElectricMiningDrill,
          ItemId.ElectricFurnace,
          ItemId.AssemblingMachine3,
        ],
      );

      spyOn(component['addMachineValue'], 'set');
      await TestBed.inject(ApplicationRef).whenStable();
      expect(component['addMachineValue'].set).toHaveBeenCalledWith(null);
    });
  });

  describe('setMachine', () => {
    it('should update the set and pass to the store action', () => {
      spyOn(component['settingsStore'], 'updateField');
      component.changeMachine(0, ItemId.AssemblingMachine2);
      expect(component['settingsStore'].updateField).toHaveBeenCalledWith(
        'machineRankIds',
        [
          ItemId.AssemblingMachine2,
          ItemId.ElectricFurnace,
          ItemId.AssemblingMachine3,
        ],
        [
          ItemId.ElectricMiningDrill,
          ItemId.ElectricFurnace,
          ItemId.AssemblingMachine3,
        ],
      );
    });
  });

  describe('dropMachine', () => {
    it('should reorder machines and pass to the store', () => {
      spyOn(component['settingsStore'], 'updateField');
      component.dropMachine({ previousIndex: 0, currentIndex: 1 } as any);
      expect(component['settingsStore'].updateField).toHaveBeenCalledWith(
        'machineRankIds',
        [
          ItemId.ElectricFurnace,
          ItemId.ElectricMiningDrill,
          ItemId.AssemblingMachine3,
        ],
        [
          ItemId.ElectricMiningDrill,
          ItemId.ElectricFurnace,
          ItemId.AssemblingMachine3,
        ],
      );
    });
  });

  describe('changeModules', () => {
    it('should dehydrate the modules', () => {
      spyOn(component['hydration'], 'dehydrateModules');
      spyOn(component['machinesStore'], 'updateRecord');
      component.changeModules(ItemId.AssemblingMachine2, []);
      expect(component['hydration'].dehydrateModules).toHaveBeenCalled();
      expect(component['machinesStore'].updateRecord).toHaveBeenCalled();
    });
  });

  describe('changeBeacons', () => {
    it('should dehydrate the beacons', () => {
      spyOn(component['hydration'], 'dehydrateBeacons');
      spyOn(component['machinesStore'], 'updateRecord');
      component.changeBeacons(ItemId.AssemblingMachine2, []);
      expect(component['hydration'].dehydrateBeacons).toHaveBeenCalled();
      expect(component['machinesStore'].updateRecord).toHaveBeenCalled();
    });
  });

  describe('removeMachine', () => {
    it('should update the set and pass to the store action', () => {
      spyOn(component['settingsStore'], 'updateField');
      component.removeMachine(ItemId.AssemblingMachine3);
      expect(component['settingsStore'].updateField).toHaveBeenCalledWith(
        'machineRankIds',
        [ItemId.ElectricMiningDrill, ItemId.ElectricFurnace],
        [
          ItemId.ElectricMiningDrill,
          ItemId.ElectricFurnace,
          ItemId.AssemblingMachine3,
        ],
      );
    });
  });

  describe('openRecipeProductivity', () => {
    it('should open the RecipeProductivityDialog', () => {
      spyOn(component['dialog'], 'open');
      component.openRecipeProductivity();
      expect(component['dialog'].open).toHaveBeenCalled();
    });
  });
});
