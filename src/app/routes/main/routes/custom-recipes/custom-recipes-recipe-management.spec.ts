import { ComponentFixture, TestBed } from '@angular/core/testing';
import endfieldJson from 'src/data/aef/data.json';
import hashJson from 'src/data/aef/hash.json';

import {
  CUSTOM_RECIPE_FORMAT,
  CUSTOM_RECIPE_VERSION,
  CustomRecipeDocument,
} from '~/models/custom-recipe';
import { ModData } from '~/models/data/mod-data';
import { ModHash } from '~/models/data/mod-hash';
import { rational } from '~/models/rational';
import { CustomRecipeService } from '~/services/custom-recipe.service';
import { DatasetsService } from '~/store/datasets.service';
import { ObjectivesService } from '~/store/objectives.service';
import { RecipesService } from '~/store/recipes.service';
import { SettingsService } from '~/store/settings.service';
import { TestModule } from '~/tests';

import { CustomRecipesComponent } from './custom-recipes.component';

describe('Custom recipe product management', () => {
  let component: CustomRecipesComponent;
  let fixture: ComponentFixture<CustomRecipesComponent>;
  let settings: SettingsService;
  let custom: CustomRecipeService;

  function document(
    id: string,
    outputs: Record<string, number> = { xiranite_powder: 1 },
  ): CustomRecipeDocument {
    return {
      format: CUSTOM_RECIPE_FORMAT,
      version: CUSTOM_RECIPE_VERSION,
      modId: 'aef',
      recipes: [
        {
          id,
          name: id,
          category: 'material',
          row: 999,
          time: 2,
          producers: ['xiranite_oven_1'],
          in: { liquid_water: 1 },
          out: outputs,
          customRecipe: { iconText: 'M' },
        },
      ],
    };
  }

  function importRecipe(id: string, outputs?: Record<string, number>): string {
    const result = custom.importDocument(
      `${id}.json`,
      document(id, outputs),
      settings.customRecipeContext()!,
    );
    expect(result.valid).withContext(JSON.stringify(result.issues)).toBeTrue();
    return result.source!.id;
  }

  function row(
    id: string,
  ): ReturnType<CustomRecipesComponent['managedRecipes']>[number] {
    return component.managedRecipes().find((recipe) => recipe.id === id)!;
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TestModule, CustomRecipesComponent],
    }).compileComponents();
    const hash: ModHash = {
      beacons: [],
      fuels: [],
      wagons: [],
      modules: [],
      technologies: [],
      ...hashJson,
    };
    TestBed.inject(DatasetsService).loadData(
      'aef',
      endfieldJson as unknown as ModData,
      hash,
    );
    settings = TestBed.inject(SettingsService);
    settings.apply({
      modId: 'aef',
      customRecipesEnabled: true,
      locationIds: new Set(['jinlong', 'tundra']),
      excludedRecipeIds: new Set(),
    });
    custom = TestBed.inject(CustomRecipeService);
    custom.replaceLibrary(
      {
        format: 'endfieldlab-custom-recipe-library',
        version: 1,
        modId: 'aef',
        enabled: true,
        sources: [],
      },
      settings.customRecipeContext()!,
    );
    importRecipe('managed-a', { xiranite_powder: 1, copper_nugget: 1 });
    importRecipe('managed-b');
    importRecipe('managed-unrelated', { proc_battery_5: 1 });
    const file = importRecipe('managed-file-off');
    custom.setSourceEnabled('aef', file, false);
    const recipe = importRecipe('managed-recipe-off');
    custom.setRecipeEnabled('aef', recipe, 'managed-recipe-off', false);
    fixture = TestBed.createComponent(CustomRecipesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    component.openRecipeManagement('xiranite_powder', 'managed-a');
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('lists every existing producer, including disabled custom files and recipes, with product-specific metadata', () => {
    const expectedBuiltIn = endfieldJson.recipes
      .filter(
        (recipe) =>
          'xiranite_powder' in recipe.out &&
          rational(recipe.out.xiranite_powder ?? 0).gt(rational.zero),
      )
      .map((recipe) => recipe.id);
    expect(
      component
        .managedRecipes()
        .filter((recipe) => !recipe.sourceId)
        .map((recipe) => recipe.id)
        .sort(),
    ).toEqual(expectedBuiltIn.sort());
    expect(component.managedRecipes().map((recipe) => recipe.id)).not.toContain(
      'managed-unrelated',
    );
    expect(row('managed-a').otherOutputs).toEqual(['赤铜块']);
    expect(row('managed-a').fileName).toBe('managed-a.json');
    expect(component.managedRecipes()[0].id).toBe('managed-a');
    expect(row('managed-file-off').inactiveReason).toBe(
      'customRecipeEditor.fileDisabled',
    );
    expect(row('managed-recipe-off').inactiveReason).toBe(
      'customRecipeEditor.disabled',
    );
  });

  it('excludes only this product’s current alternatives, preserves unrelated state and does not add production targets', () => {
    settings.apply({ excludedRecipeIds: new Set(['iron_powder']) });
    const objectives = TestBed.inject(ObjectivesService);
    const before = objectives.state();
    const fileStates = custom.exportLibrary('aef');
    component.blockOtherProductRecipes();
    const expected = component
      .managedRecipes()
      .filter((recipe) => recipe.id !== 'managed-a')
      .map((recipe) => recipe.id);
    expect(settings.state().excludedRecipeIds).toEqual(
      new Set(['iron_powder', ...expected]),
    );
    expect(row('managed-a').included).toBeTrue();
    expect(row('managed-b').included).toBeFalse();
    expect(
      settings.settings().excludedRecipeIds.has('copper_nugget'),
    ).toBeFalse();
    expect(
      settings.settings().excludedRecipeIds.has('managed-unrelated'),
    ).toBeFalse();
    expect(custom.exportLibrary('aef')).toEqual(fileStates);
    expect(objectives.state()).toBe(before);
  });

  it('keeps multiple selected native/custom recipes available to the calculator and updates the same item state in other editors', () => {
    component.blockOtherProductRecipes();
    component.setManagedRecipeIncluded('managed-b', true);
    component.setManagedRecipeIncluded('xiranite_powder-carbon_mtl', true);
    const adjusted = TestBed.inject(RecipesService).adjustedDataset();
    expect(new Set(adjusted.itemAvailableRecipeIds['xiranite_powder'])).toEqual(
      new Set(['managed-a', 'managed-b', 'xiranite_powder-carbon_mtl']),
    );
    component.openRecipeManagement('xiranite_powder', 'managed-b');
    expect(row('managed-a').included).toBeTrue();
    expect(row('managed-b').included).toBeTrue();
  });

  it('leaves subsequently imported recipes enabled and leaves existing excluded recipes excluded', () => {
    component.blockOtherProductRecipes();
    importRecipe('managed-new');
    expect(row('managed-new').included).toBeTrue();
    expect(row('managed-b').included).toBeFalse();
    expect(settings.state().excludedRecipeIds?.has('managed-new')).toBeFalse();
  });

  it('does not enable a file or the global switch through an individual toggle or the shortcut', () => {
    const before = settings.state().excludedRecipeIds;
    component.setManagedRecipeIncluded('managed-file-off', true);
    expect(row('managed-file-off').included).toBeFalse();
    expect(settings.state().excludedRecipeIds).toBe(before);
    component.openRecipeManagement('xiranite_powder', 'managed-file-off');
    expect(component.canBlockOtherRecipes()).toBeFalse();
    component.blockOtherProductRecipes();
    expect(settings.state().excludedRecipeIds).toBe(before);
    settings.apply({ customRecipesEnabled: false });
    component.openRecipeManagement('xiranite_powder', 'managed-a');
    component.setManagedRecipeIncluded('managed-a', true);
    component.blockOtherProductRecipes();
    expect(settings.customRecipesEnabled()).toBeFalse();
    expect(settings.state().excludedRecipeIds).toBe(before);
    expect(row('managed-a').inactiveReason).toBe(
      'customRecipeEditor.customRecipesDisabled',
    );
  });

  it('can explicitly enable an individually disabled recipe without changing its file or other recipes', () => {
    component.setManagedRecipeIncluded('managed-recipe-off', true);
    expect(row('managed-recipe-off').included).toBeTrue();
    expect(row('managed-file-off').included).toBeFalse();
    expect(
      custom
        .sourcesForMod('aef')
        .find((source) => source.fileName === 'managed-recipe-off.json')!
        .disabledRecipeIds,
    ).toEqual([]);
  });

  it('never persists computed temporary exclusions when editing a different recipe', () => {
    settings.apply({ excludedRecipeIds: undefined });
    component.setManagedRecipeIncluded('xiranite_powder-carbon_mtl', false);
    expect(
      settings.state().excludedRecipeIds?.has('managed-file-off'),
    ).toBeFalse();
    expect(
      settings.state().excludedRecipeIds?.has('managed-recipe-off'),
    ).toBeFalse();
    custom.setSourceEnabled('aef', row('managed-file-off').sourceId!, true);
    expect(row('managed-file-off').included).toBeTrue();
  });

  it('does not restore excluded alternatives when the retained recipe or file is disabled and re-enabled', () => {
    component.blockOtherProductRecipes();
    const exclusions = settings.state().excludedRecipeIds;
    const sourceId = row('managed-a').sourceId!;
    custom.setSourceEnabled('aef', sourceId, false);
    expect(component.managedIncludedCount()).toBe(0);
    expect(settings.state().excludedRecipeIds).toBe(exclusions);
    custom.setSourceEnabled('aef', sourceId, true);
    expect(row('managed-a').included).toBeTrue();
    expect(row('managed-b').included).toBeFalse();
    component.setManagedRecipeIncluded('managed-a', false);
    expect(component.managedIncludedCount()).toBe(0);
    component.setManagedRecipeIncluded('managed-a', true);
    expect(row('managed-b').included).toBeFalse();
  });

  it('treats every output separately while excluding a multi-output recipe as a whole', () => {
    component.openRecipeManagement('copper_nugget', 'managed-a');
    expect(component.managedRecipes().map((recipe) => recipe.id)).not.toContain(
      'managed-b',
    );
    component.setManagedRecipeIncluded('managed-a', false);
    component.openRecipeManagement('xiranite_powder', 'managed-b');
    expect(row('managed-a').included).toBeFalse();
    expect(row('managed-b').included).toBeTrue();
  });

  it('cannot exclude alternatives for an unsaved/missing current recipe or an obsolete mod', () => {
    component.openRecipeManagement('xiranite_powder', 'unsaved-id');
    const before = settings.state().excludedRecipeIds;
    component.blockOtherProductRecipes();
    expect(settings.state().excludedRecipeIds).toBe(before);
    component.openRecipeManagement('xiranite_powder', 'managed-a');
    settings.apply({ modId: '1.1' });
    component.blockOtherProductRecipes();
    component.setManagedRecipeIncluded('managed-a', false);
    expect(settings.state().excludedRecipeIds).toBe(before);
    expect(component.managedRecipes()).toEqual([]);
  });

  it('connects the saved output-row button to the product manager', () => {
    fixture.detectChanges();
    const button = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLButtonElement>('.product-recipe-management')!;
    component.recipeManagementVisible = false;
    button.click();
    fixture.detectChanges();
    expect(component.recipeManagementVisible).toBeTrue();
    expect(component.managedItemId()).toBe('xiranite_powder');
    expect(component.managedRecipeId()).toBe('managed-a');
  });
});
