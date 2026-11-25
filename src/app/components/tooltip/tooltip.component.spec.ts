import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ItemId, Mocks, RecipeId, setInputs, TestModule } from '~/tests';

import { TooltipComponent } from './tooltip.component';

describe('TooltipComponent', () => {
  let component: TooltipComponent;
  let fixture: ComponentFixture<TooltipComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule, TooltipComponent],
    });
    fixture = TestBed.createComponent(TooltipComponent);
    component = fixture.componentInstance;
    setInputs(fixture, { id: ItemId.IronPlate });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('recipe', () => {
    it('should return undefined for invalid types', () => {
      setInputs(fixture, { type: 'beacon' });
      expect(component.recipe()).toBeUndefined();
    });

    it('should not return a recipe if multiple are available', () => {
      setInputs(fixture, { id: 'petroleum-gas' });
      expect(component.recipe()).toBeUndefined();
    });

    it('explains formation expectations and unmodeled shared gas only for formation recipes', () => {
      const recipe = Mocks.adjustedDataset.recipeEntities[RecipeId.CopperOre];
      const formation = {
        ...recipe,
        id: 'formation-example',
        flags: new Set([...recipe.flags, 'formation' as const]),
      };
      component.data = signal({
        ...Mocks.adjustedDataset,
        recipeEntities: {
          ...Mocks.adjustedDataset.recipeEntities,
          [formation.id]: formation,
        },
      });
      setInputs(fixture, { id: recipe.id, type: 'recipe' });
      expect(fixture.nativeElement.textContent).not.toContain(
        'data.formationExpectation',
      );
      setInputs(fixture, { id: formation.id, type: 'recipe' });
      expect(fixture.nativeElement.textContent).toContain(
        'data.formationExpectation',
      );
    });
  });
});
