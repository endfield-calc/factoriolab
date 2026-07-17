import { computed } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ObjectiveType } from '~/models/enum/objective-type';
import { fromNumber,rational } from '~/models/rational';
import { SettingsService } from '~/store/settings.service';
import { TestModule } from '~/tests';

import { ResourceInputComponent } from './resource-input.component';

describe('ResourceInputComponent', () => {
  let component: ResourceInputComponent;
  let fixture: ComponentFixture<ResourceInputComponent>;
  let settingsSvc: SettingsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, ResourceInputComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ResourceInputComponent);
    component = fixture.componentInstance;
    settingsSvc = TestBed.inject(SettingsService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should always expose gas resources for direct-mining limits', () => {
    expect(component.limitItems()).toEqual([
      { id: 'originium_ore', recipe: 'originium_ore' },
      { id: 'quartz_sand', recipe: 'quartz_sand' },
      { id: 'iron_ore', recipe: 'iron_ore' },
      { id: 'copper_ore', recipe: 'copper_ore-liquid_water' },
      { id: 'gas_xiranite', recipe: 'gas_xiranite' },
      { id: 'gas_inert', recipe: 'gas_inert' },
    ]);
  });

  it('should convert gas resource limits to RecipeLimit instead of ItemLimit', () => {
    const origData = component.data();
    component.data = computed(() => ({
      ...origData,
      adjustedRecipe: {
        ...origData.adjustedRecipe,
        gas_xiranite: { time: rational(3n), out: { gas_xiranite: rational(1n) } } as any,
        gas_inert: { time: rational(3n), out: { gas_inert: rational(1n) } } as any,
      },
    }));
    component.ready.set(true);
    component.enableLimitItems.set(true);
    component.limitItemsNum.set({
      originium_ore: fromNumber(560),
      quartz_sand: fromNumber(240),
      iron_ore: fromNumber(1080),
      copper_ore: rational.zero,
      gas_xiranite: rational(5n),
      gas_inert: rational.zero,
    });
    fixture.detectChanges();

    const objectives = Object.values(component.objectivesSvc.state());

    // Gas resources should produce RecipeLimit, not ItemLimit
    const gasRecipeLimit = objectives.find(
      (o) =>
        o.type === ObjectiveType.RecipeLimit && o.targetId === 'gas_xiranite',
    );
    expect(gasRecipeLimit?.value).toEqual(rational(1n, 4n));
    expect(
      objectives.some(
        (o) =>
          o.type === ObjectiveType.ItemLimit && o.targetId === 'gas_xiranite',
      ),
    ).toBeFalse();

    // Solid resources still get ItemLimit + ItemLimitOutput
    const displayRate = settingsSvc.displayRateInfo().value;
    const rateFactor = displayRate.mul(rational(1n, 60n));

    const ironItemLimit = objectives.find(
      (o) => o.type === ObjectiveType.ItemLimit && o.targetId === 'iron_ore',
    );
    expect(ironItemLimit).toBeTruthy();
    expect(ironItemLimit?.value).toEqual(fromNumber(1080).mul(rateFactor));

    const ironOutputLimit = objectives.find(
      (o) =>
        o.type === ObjectiveType.ItemLimitOutput && o.targetId === 'iron_ore',
    );
    expect(ironOutputLimit).toBeTruthy();
    expect(ironOutputLimit?.value).toEqual(
      fromNumber(1080).div(fromNumber(20)),
    );
  });

  it('should prefill direct gas mining limits for Jinlong 1.4', () => {
    component.applyOneKey('jinlong1.4');

    expect(component.enableLimitItems()).toBeTrue();
    expect(component.limitItemsNum()['gas_xiranite']).toEqual(fromNumber(100));
    expect(component.limitItemsNum()['gas_inert']).toEqual(fromNumber(460));
  });
});
