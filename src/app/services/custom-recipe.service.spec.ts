import {
  CUSTOM_RECIPE_FORMAT,
  CUSTOM_RECIPE_VERSION,
  CustomRecipeValidationContext,
} from '~/models/custom-recipe';

import { CustomRecipeService } from './custom-recipe.service';
import { CustomRecipeValidatorService } from './custom-recipe-validator.service';

describe('CustomRecipeService', () => {
  const context: CustomRecipeValidationContext = {
    modId: 'aef',
    recipeIds: new Set(['existing-recipe']),
    itemIds: new Set(['input-item', 'output-item']),
    machineIds: new Set(['machine-item']),
    categoryIds: new Set(['material']),
    locationIds: new Set(['tundra']),
  };

  function document(id = 'custom-recipe'): Record<string, unknown> {
    return {
      format: CUSTOM_RECIPE_FORMAT,
      version: CUSTOM_RECIPE_VERSION,
      modId: 'aef',
      recipes: [
        {
          id,
          name: 'Custom recipe',
          category: 'material',
          row: 999,
          time: 2,
          producers: ['machine-item'],
          in: { 'input-item': 1 },
          out: { 'output-item': 2 },
          customRecipe: { iconText: '自' },
        },
      ],
    };
  }

  function createService(): CustomRecipeService {
    return new CustomRecipeService(new CustomRecipeValidatorService());
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it('imports and replaces a source by file name', () => {
    const service = createService();

    const first = service.importDocument('recipes.json', document(), context);
    const replacement = service.importDocument(
      'recipes.json',
      document('replacement-recipe'),
      context,
    );

    expect(first.valid).toBeTrue();
    expect(replacement.valid).toBeTrue();
    expect(service.sourcesForMod('aef').length).toEqual(1);
    expect(service.recipesForMod('aef').map((recipe) => recipe.id)).toEqual([
      'replacement-recipe',
    ]);
  });

  it('keeps source and recipe enablement when a file is replaced', () => {
    const service = createService();
    const first = service.importDocument('recipes.json', document(), context);
    const sourceId = first.source?.id ?? '';

    service.setSourceEnabled('aef', sourceId, false);
    expect(service.excludedRecipeIdsForMod('aef')).toEqual(
      new Set(['custom-recipe']),
    );

    const replacement = document('replacement-recipe');
    const replacementRecipe = (
      replacement['recipes'] as Record<string, unknown>[]
    )[0];
    replacement['recipes'] = [
      replacementRecipe,
      { ...replacementRecipe, id: 'new-recipe' },
    ];
    expect(
      service.importDocument('recipes.json', replacement, context).valid,
    ).toBeTrue();

    const source = service.sourcesForMod('aef')[0];
    expect(source.enabled).toBeFalse();
    expect(service.excludedRecipeIdsForMod('aef')).toEqual(
      new Set(['replacement-recipe', 'new-recipe']),
    );
  });

  it('persists an individually disabled recipe', () => {
    const service = createService();
    const result = service.importDocument('recipes.json', document(), context);
    const sourceId = result.source?.id ?? '';

    service.setRecipeEnabled('aef', sourceId, 'custom-recipe', false);
    expect(service.excludedRecipeIdsForMod('aef')).toEqual(
      new Set(['custom-recipe']),
    );

    const restored = createService();
    expect(restored.excludedRecipeIdsForMod('aef')).toEqual(
      new Set(['custom-recipe']),
    );
    restored.setRecipeEnabled('aef', sourceId, 'custom-recipe', true);
    expect(restored.excludedRecipeIdsForMod('aef')).toEqual(new Set());
  });

  it('rejects recipe ids already provided by another source', () => {
    const service = createService();

    expect(
      service.importDocument('one.json', document(), context).valid,
    ).toBeTrue();
    const result = service.importDocument('two.json', document(), context);

    expect(result.valid).toBeFalse();
    expect(result.issues.map((issue) => issue.path)).toEqual(['recipes[0].id']);
  });

  it('persists sources and removes them independently', () => {
    const service = createService();
    const result = service.importDocument('recipes.json', document(), context);
    const sourceId = result.source?.id;

    expect(sourceId).toBeDefined();
    expect(localStorage.getItem('customRecipes')).toEqual(
      JSON.stringify(service.state()),
    );

    const restored = createService();
    expect(restored.recipesForMod('aef').map((recipe) => recipe.id)).toEqual([
      'custom-recipe',
    ]);

    restored.removeSource('aef', sourceId ?? '');
    expect(restored.sourcesForMod('aef')).toEqual([]);
    expect(localStorage.getItem('customRecipes')).toBeNull();
  });

  it('imports multiple JSON files and reports malformed JSON', async () => {
    const service = createService();
    const results = await service.importFiles(
      [
        new File([JSON.stringify(document())], 'recipes.json'),
        new File(['{'], 'broken.json'),
      ],
      context,
    );

    expect(results.map((result) => result.valid)).toEqual([true, false]);
    expect(results[1].issues[0].message).toContain('Invalid JSON');
  });

  it('creates placeholder items for unknown recipe references', () => {
    const service = createService();
    const source = document();
    const recipe = (source['recipes'] as Record<string, unknown>[])[0];
    const result = service.importDocument(
      'recipes.json',
      {
        ...source,
        recipes: [
          {
            ...recipe,
            in: { 'new-material': 1 },
          },
        ],
      },
      context,
    );

    expect(result.valid).toBeTrue();
    expect(service.generatedItemsForMod('aef')).toEqual([
      jasmine.objectContaining({
        id: 'new-material',
        name: 'new-material',
        iconText: 'n',
      }),
    ]);
  });

  it('generates activity items for unknown recipe references', () => {
    const service = createService();
    const source = document();
    const recipe = (source['recipes'] as Record<string, unknown>[])[0];

    expect(
      service.importDocument(
        'recipes.json',
        {
          ...source,
          recipes: [{ ...recipe, in: { 'new-material': 1 } }],
        },
        context,
      ).valid,
    ).toBeTrue();
    expect(service.generatedItemsForMod('aef')).toEqual([
      jasmine.objectContaining({
        id: 'new-material',
        category: 'activity',
        row: 999,
      }),
    ]);
  });
});
