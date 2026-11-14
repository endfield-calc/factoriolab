import { KeyValue } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { rational } from '~/rational/rational';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { TotalValue } from '~/state/objectives/total-value';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { ItemId } from '~/tests/item-id';
import { RecipeId } from '~/tests/recipe-id';
import { TestModule } from '~/tests/test-module';
import { setInputs } from '~/tests/utils';

import { TotalCell } from './total-cell';

describe('TotalCell', () => {
  let component: TotalCell;
  let fixture: ComponentFixture<TotalCell>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TotalCell],
    }).compileComponents();

    fixture = TestBed.createComponent(TotalCell);
    setInputs(fixture, { value: {} });
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('sortByValue', () => {
    it('should sort KeyValue pairs by their value', () => {
      const a: KeyValue<string, TotalValue> = {
        key: 'key',
        value: { total: rational(2n), iconType: 'item', tooltipType: 'item' },
      };
      const b: KeyValue<string, TotalValue> = {
        key: 'key',
        value: { total: rational(1n), iconType: 'item', tooltipType: 'item' },
      };
      expect(component.sortByValue(a, b)).toEqual(-1);
    });
  });
});

describe('TotalCell with a producerless recipe', () => {
  it('excludes producerless recipes while preserving power and displays machine names with fallback', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, TotalCell],
    }).compileComponents();
    const store = TestBed.inject(ObjectivesStore);
    const data = TestBed.inject(RecipesStore).adjustedDataset();
    const recipe = data.adjustedRecipe[RecipeId.Coal];
    spyOn(store, 'steps').and.returnValue([
      {
        id: 'hidden',
        recipeId: 'hidden-recipe',
        recipe: { ...recipe, producers: undefined },
        recipeSettings: {},
        machines: rational(9),
        power: rational(5),
      },
      {
        id: 'visible',
        recipeId: 'arbitrary-recipe',
        recipe,
        recipeSettings: { machineId: ItemId.ElectricMiningDrill },
        machines: rational(2),
        power: rational(-2),
      },
    ]);
    const totals = store.totals();
    expect(totals.machines[ItemId.ElectricMiningDrill].total).toEqual(
      rational(2),
    );
    expect(totals.power).toEqual(rational(3));

    const fixture = TestBed.createComponent(TotalCell);
    setInputs(fixture, { value: totals.machines });
    fixture.detectChanges();
    const expectedName =
      TestBed.inject(SettingsStore).dataset().itemRecord[
        ItemId.ElectricMiningDrill
      ].name;
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      expectedName,
    );

    setInputs(fixture, {
      value: {
        'unlisted-machine': {
          total: rational.one,
          iconType: 'item',
          tooltipType: 'machine',
        },
      },
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'unlisted-machine',
    );
  });
});
