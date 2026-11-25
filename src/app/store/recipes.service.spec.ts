import { TestBed } from '@angular/core/testing';

import { spread } from '~/helpers';
import { rational } from '~/models/rational';
import { ItemId, Mocks, RecipeId, TestModule } from '~/tests';

import { RecipesService } from './recipes.service';

describe('RecipesService', () => {
  let service: RecipesService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    service = TestBed.inject(RecipesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('recipesState', () => {
    it('should return the recipe settings', () => {
      const result = service.settings();
      expect(Object.keys(result).length).toEqual(
        Mocks.adjustedDataset.recipeIds.length,
      );
    });

    it('should reset invalid beacon totals', () => {
      spyOn(service, 'state').and.returnValue({
        [Mocks.item1.id]: {
          beacons: [
            {
              total: rational(8n),
              count: rational.zero,
              id: ItemId.Beacon,
              modules: [{ count: rational(2n), id: ItemId.Module }],
            },
          ],
        },
      });
      const result = service.settings();
      expect(result[Mocks.item1.id].beacons?.[0].total).toBeUndefined();
    });

    it('restores a formation recipe with the previous virtual machine', () => {
      const recipe = Mocks.dataset.recipeEntities[RecipeId.IronPlate];
      const data = spread(Mocks.dataset, {
        recipeEntities: spread(Mocks.dataset.recipeEntities, {
          [recipe.id]: spread(recipe, {
            flags: new Set([...recipe.flags, 'formation' as const]),
            producers: [ItemId.ElectricFurnace],
          }),
        }),
      });
      spyOn(service.settingsSvc, 'dataset').and.returnValue(data);
      service.load({ [recipe.id]: { machineId: '__formation_position' } });

      expect(service.settings()[recipe.id].machineId).toEqual(
        ItemId.ElectricFurnace,
      );
      expect(service.state()[recipe.id].machineId).toEqual(
        '__formation_position',
      );
      expect(
        service.adjustedDataset().adjustedRecipe[recipe.id].flags.has(
          'formation',
        ),
      ).toBeTrue();
    });
  });

  describe('adjustedDataset', () => {
    it('should call the utility method', () => {
      spyOn(service.recipeSvc, 'adjustDataset');
      service.adjustedDataset();
      expect(service.recipeSvc.adjustDataset).toHaveBeenCalled();
    });
  });
});
