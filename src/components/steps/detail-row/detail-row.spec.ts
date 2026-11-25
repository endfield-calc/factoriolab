import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { Icon } from '~/components/icon/icon';
import { rational } from '~/rational/rational';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { ItemId } from '~/tests/item-id';
import { Mocks } from '~/tests/mocks/mocks';
import { RecipeId } from '~/tests/recipe-id';
import { TestModule } from '~/tests/test-module';
import { setInputs } from '~/tests/utils';

import { DetailRow } from './detail-row';

describe('DetailRow', () => {
  let component: DetailRow;
  let fixture: ComponentFixture<DetailRow>;
  let mocks: Mocks;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, DetailRow],
    }).compileComponents();

    fixture = TestBed.createComponent(DetailRow);
    mocks = TestBed.inject(Mocks);
    setInputs(fixture, {
      value: { itemId: ItemId.ElectronicCircuit, items: rational(360n) },
      leftSpan: 0,
    });
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('safeFactor', () => {
    it("should ensure we don't divide by zero", () => {
      setInputs(fixture, { factor: rational.zero });
      expect(component['safeFactor']()).toEqual(rational.one);
    });
  });

  describe('inserterId', () => {
    it('should determine the best initial inserterId to use', async () => {
      expect(component['inserterId']()).toEqual(ItemId.FastInserter);
      setInputs(fixture, {
        value: { itemId: ItemId.ElectronicCircuit, items: rational(3600n) },
      });
      await TestBed.inject(ApplicationRef).whenStable();
      expect(component['inserterId']()).toEqual(ItemId.BulkInserter);
    });

    it('should return undefined where inserter is not relevant', () => {
      setInputs(fixture, {
        value: { itemId: ItemId.CrudeOil, items: rational(360n) },
      });
      expect(component['inserterId']()).toBeUndefined();
    });

    it('should ignore quality inserters', async () => {
      const data = mocks.getDataset();
      data.itemRecord[ItemId.FastInserter].quality = {
        id: '1',
        name: '1',
        level: 1,
      };
      spyOn<any>(component, 'data').and.returnValue(data);
      setInputs(fixture, {
        value: { itemId: ItemId.AdvancedCircuit, items: rational(360n) },
        leftSpan: 0,
      });
      await TestBed.inject(ApplicationRef).whenStable();
      expect(component['inserterId']()).toEqual(ItemId.BulkInserter);
    });
  });

  it('labels derived sources on both icons while retaining ordinary numbering', () => {
    const row = {
      recipeId: RecipeId.ElectronicCircuit,
      recipeObjectiveId: 'ef:resource:iron_ore',
      percent: rational.one,
      destId: RecipeId.AdvancedCircuit,
      destRecipeObjectiveId: 'ef:resource:copper_ore',
      destType: 'recipe' as const,
    };
    setInputs(fixture, { value: row });
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    expect(html.textContent).not.toContain('ef:resource:');
    expect(html.textContent?.match(/endfield\.resources\.source/g)).toHaveSize(
      2,
    );

    setInputs(fixture, {
      value: { ...row, recipeObjectiveId: '42', destRecipeObjectiveId: '51' },
    });
    fixture.detectChanges();
    expect(html.textContent).toContain('#42');
    expect(html.textContent).toContain('51');
    expect(html.textContent).not.toContain('endfield.resources.source');

    setInputs(fixture, { value: { recipeId: RecipeId.ElectronicCircuit } });
    fixture.detectChanges();
    expect(html.textContent).not.toContain('#');
  });

  it('renders a derived recipe icon for both source and destination rows', () => {
    const recipes = TestBed.inject(RecipesStore);
    const adjusted = recipes.adjustedDataset();
    const icon = adjusted.iconRecord.item[ItemId.ElectronicCircuit];
    const id = '__transfer_for_detail_test';
    spyOn(recipes, 'adjustedDataset').and.returnValue({
      ...adjusted,
      iconRecord: {
        ...adjusted.iconRecord,
        recipe: { ...adjusted.iconRecord.recipe, [id]: icon },
      },
    });
    setInputs(fixture, {
      value: {
        recipeId: id,
        percent: rational.one,
        destId: id,
        destType: 'recipe',
      },
    });
    fixture.detectChanges();
    const matches = fixture.debugElement
      .queryAll(By.directive(Icon))
      .map((entry) => entry.componentInstance as Icon)
      .filter((entry) => entry.value() === id);
    expect(matches.length).toBe(2);
    for (const entry of matches) expect(entry['icon']()).toEqual(icon);
  });
});
