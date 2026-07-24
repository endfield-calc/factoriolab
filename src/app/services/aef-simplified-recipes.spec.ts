import { TestBed } from '@angular/core/testing';
import aefJson from 'src/data/aef/data.json';
import baseAefJson from 'src/data/aef/base-data.json';
import simplifiedAefJson from 'src/data/aef/simplified-recipes.json';

import { Mod } from '~/models/mod';
import { Game } from '~/models/enum/game';
import { ObjectiveType } from '~/models/enum/objective-type';
import { ObjectiveUnit } from '~/models/enum/objective-unit';
import { Preset } from '~/models/enum/preset';
import { SimplexResultType } from '~/models/enum/simplex-result-type';
import { rational } from '~/models/rational';
import { TestModule } from '~/tests';
import { ItemsService } from '~/store/items.service';
import { MachinesService } from '~/store/machines.service';
import { RecipesService } from '~/store/recipes.service';
import {
  initialSettingsState,
  SettingsService,
} from '~/store/settings.service';

import { RecipeService } from './recipe.service';
import { SimplexService } from './simplex.service';

describe('AEF simplified recipes', () => {
  it('should match the generated AEF data', () => {
    const items = [...baseAefJson.items];
    const insertAfter = simplifiedAefJson.itemInsertAfter;
    const index = insertAfter
      ? items.findIndex((item) => item.id === insertAfter)
      : items.length - 1;

    if (index < 0) {
      throw new Error(
        `Missing simplified item insertion point: ${insertAfter}`,
      );
    }

    items.splice(index + 1, 0, ...simplifiedAefJson.items);

    expect(aefJson.items).toEqual(items);
    expect(aefJson.recipes).toEqual([
      ...baseAefJson.recipes,
      ...simplifiedAefJson.recipes,
    ]);
  });

  it('should use direct simplified recipes when enabled', () => {
    TestBed.configureTestingModule({ imports: [TestModule] });

    const settingsSvc = TestBed.inject(SettingsService);
    const itemsSvc = TestBed.inject(ItemsService);
    const machinesSvc = TestBed.inject(MachinesService);
    const recipesSvc = TestBed.inject(RecipesService);
    const recipeSvc = TestBed.inject(RecipeService);
    const simplexSvc = TestBed.inject(SimplexService);
    const mod = {
      ...aefJson,
      id: 'aef',
      name: 'Arknights: Endfield',
      game: Game.ArknightsEndfield,
      flags: 'aef',
    } as unknown as Mod;
    const defaults = settingsSvc.computeDefaults(mod, Preset.Minimum);
    const dataset = settingsSvc.computeDataset(
      mod,
      undefined,
      undefined,
      Game.ArknightsEndfield,
      defaults,
    );
    const settings = settingsSvc.computeSettings(
      {
        ...initialSettingsState,
        modId: 'aef',
        simplifiedRecipes: true,
        locationIds: new Set(['tundra']),
      },
      defaults,
      dataset,
    );
    const items = itemsSvc.computeItemsSettings({}, settings, dataset);
    const machines = machinesSvc.computeMachinesSettings({}, settings, dataset);
    const recipes = recipesSvc.computeRecipesSettings(
      {},
      machines,
      settings,
      dataset,
    );
    const adjustedDataset = recipeSvc.adjustDataset(
      recipes,
      items,
      settings,
      dataset,
    );

    const result = simplexSvc.solve(
      [
        {
          id: '1',
          targetId: 'originium_enr_powder',
          type: ObjectiveType.Output,
          unit: ObjectiveUnit.Items,
          value: rational.one,
        },
        {
          id: '2',
          targetId: 'liquid_plant_grass_1',
          type: ObjectiveType.Output,
          unit: ObjectiveUnit.Items,
          value: rational.one,
        },
        {
          id: '3',
          targetId: 'liquid_plant_grass_2',
          type: ObjectiveType.Output,
          unit: ObjectiveUnit.Items,
          value: rational.one,
        },
      ],
      settings,
      adjustedDataset,
      false,
    );
    const recipeIds = result.steps.map((step) => step.recipeId);

    expect(result.resultType).toBe(SimplexResultType.Solved);
    expect(recipeIds).toContain('simplified-originium_enr_powder');
    expect(recipeIds).toContain('simplified-liquid_plant_grass_1');
    expect(recipeIds).toContain('simplified-liquid_plant_grass_2');
    expect(recipeIds).not.toContain('originium_enr_powder');
    expect(recipeIds).not.toContain('originium_powder');
    expect(recipeIds).not.toContain('liquid_plant_grass_1');
    expect(recipeIds).not.toContain('liquid_plant_grass_2');
    expect(
      dataset.recipeEntities['simplified-originium_enr_powder'].producers,
    ).toEqual(['__simplified_recipe']);
    expect(
      dataset.recipeEntities['simplified-liquid_plant_grass_1'].producers,
    ).toEqual(['__simplified_recipe']);
    expect(
      dataset.recipeEntities['simplified-liquid_plant_grass_2'].producers,
    ).toEqual(['__simplified_recipe']);
    expect(dataset.itemEntities['__simplified_recipe'].name).toBe(
      '简化计算配方',
    );
  });
});
