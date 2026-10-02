import {
  CUSTOM_RECIPE_EXAMPLE_DOCUMENT,
  CUSTOM_RECIPE_FORMAT,
  CUSTOM_RECIPE_LIBRARY_FORMAT,
  CUSTOM_RECIPE_VERSION,
  CustomRecipeLibraryDocument,
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

  it('persists stars independently without changing source order, recipes or enablement', () => {
    const service = createService();
    service.importDocument('one.json', document('first'), context);
    service.importDocument('two.json', document('second'), context);
    service.setSourceEnabled('aef', 'aef:one.json', false);
    service.setRecipeEnabled('aef', 'aef:two.json', 'second', false);
    const recipes = service.exportDocument('aef');
    const excluded = service.excludedRecipeIdsForMod('aef');
    service.setSourceStarred('aef', 'aef:two.json', true);
    expect(
      service.sourcesForMod('aef').map((source) => source.fileName),
    ).toEqual(['one.json', 'two.json']);
    expect(
      service.sourcesForMod('aef').map((source) => source.starred),
    ).toEqual([false, true]);
    expect(service.exportDocument('aef')).toEqual(recipes);
    expect(service.excludedRecipeIdsForMod('aef')).toEqual(excluded);
    const restored = createService();
    expect(restored.sourcesForMod('aef')).toEqual(service.sourcesForMod('aef'));
    restored.setSourceStarred('aef', 'aef:two.json', false);
    expect(createService().sourcesForMod('aef')[1].starred).toBeFalse();
  });

  it('does not write storage when starring a missing file or keeping its current star', () => {
    const service = createService();
    service.importDocument('one.json', document('first'), context);
    const state = service.state();
    const before = localStorage.getItem('customRecipes');
    service.setSourceStarred('aef', 'missing', true);
    service.setSourceStarred('other-mod', 'aef:one.json', true);
    service.setSourceStarred('aef', 'aef:one.json', false);
    expect(service.state()).toBe(state);
    expect(localStorage.getItem('customRecipes')).toEqual(before);
  });

  it('loads older stored files without stars as unstarred without losing their data', () => {
    const service = createService();
    service.importDocument('one.json', document('first'), context);
    service.setSourceEnabled('aef', 'aef:one.json', false);
    const sources = service.sourcesForMod('aef').map((source) => {
      const legacy = { ...source };
      delete legacy.starred;
      return legacy;
    });
    localStorage.setItem('customRecipes', JSON.stringify({ aef: sources }));
    const restored = createService();
    expect(restored.sourcesForMod('aef').length).toEqual(1);
    expect(restored.sourcesForMod('aef')[0].starred).toBeFalse();
    expect(restored.sourcesForMod('aef')[0].enabled).toBeFalse();
    expect(restored.sourcesForMod('aef')[0].document).toEqual(
      sources[0].document,
    );
  });

  it('keeps stars when replacing a file and never transfers a deleted file star to a new file', () => {
    const service = createService();
    service.importDocument('one.json', document('first'), context);
    service.setSourceStarred('aef', 'aef:one.json', true);
    service.importDocument('one.json', document('replacement'), context);
    expect(service.sourcesForMod('aef')[0].starred).toBeTrue();
    service.removeSource('aef', 'aef:one.json');
    service.importDocument('one.json', document('replacement'), context);
    expect(service.sourcesForMod('aef')[0].starred).toBeFalse();
  });

  it('preserves source order when updating an existing file repeatedly', () => {
    const service = createService();
    service.importDocument('one.json', document('first'), context);
    service.importDocument('two.json', document('second'), context);
    service.importDocument('one.json', document('changed'), context);
    expect(
      service.sourcesForMod('aef').map((source) => source.fileName),
    ).toEqual(['one.json', 'two.json']);
  });

  it('renames the original source in place and preserves enablement, generated items and stored state', () => {
    const service = createService();
    const original = document('first');
    (original['recipes'] as Record<string, unknown>[])[0]['in'] = {
      'new-material': 1,
    };
    service.importDocument('one.json', original, context);
    service.importDocument('two.json', document('second'), context);
    service.setSourceEnabled('aef', 'aef:one.json', false);
    service.setRecipeEnabled('aef', 'aef:one.json', 'first', false);
    service.setSourceStarred('aef', 'aef:one.json', true);
    const otherSource = service.sourcesForMod('aef')[1];

    const result = service.importDocument(
      'renamed.json',
      original,
      context,
      false,
      'aef:one.json',
    );
    expect(result.valid).toBeTrue();
    const sources = service.sourcesForMod('aef');
    expect(sources.map((source) => source.fileName)).toEqual([
      'renamed.json',
      'two.json',
    ]);
    expect(sources[0].id).toEqual('aef:renamed.json');
    expect(sources[0].enabled).toBeFalse();
    expect(sources[0].disabledRecipeIds).toEqual(['first']);
    expect(sources[0].starred).toBeTrue();
    expect(sources[0].generatedItemIds).toEqual(['new-material']);
    expect(sources[1]).toBe(otherSource);
    expect(createService().sourcesForMod('aef')).toEqual(sources);
    expect(service.exportLibrary('aef').sources[0].fileName).toEqual(
      'renamed.json',
    );
    expect(
      service.importDocument(
        'renamed.json',
        original,
        context,
        false,
        sources[0].id,
      ).valid,
    ).toBeTrue();
    expect(service.sourcesForMod('aef').length).toEqual(2);
  });

  for (const target of ['two.json', '', ' invalid.json ', 'invalid.txt']) {
    it(`rejects renaming to ${JSON.stringify(target)} without mutating either file`, () => {
      const service = createService();
      service.importDocument('one.json', document('first'), context);
      service.importDocument('two.json', document('second'), context);
      const before = localStorage.getItem('customRecipes');
      const state = service.state();
      const result = service.importDocument(
        target,
        document('first'),
        context,
        false,
        'aef:one.json',
      );
      expect(result.valid).toBeFalse();
      expect(result.issues[0].path).toEqual('fileName');
      expect(service.state()).toBe(state);
      expect(localStorage.getItem('customRecipes')).toEqual(before);
    });
  }

  it('leaves the original file intact when renamed recipe data fails validation', () => {
    const service = createService();
    service.importDocument('one.json', document('first'), context);
    service.importDocument('two.json', document('second'), context);
    const before = localStorage.getItem('customRecipes');
    const conflicting = service.importDocument(
      'renamed.json',
      document('second'),
      context,
      false,
      'aef:one.json',
    );
    expect(conflicting.valid).toBeFalse();
    expect(
      conflicting.issues.some((issue) => issue.path === 'recipes[0].id'),
    ).toBeTrue();
    const invalid = document('first');
    (invalid['recipes'] as Record<string, unknown>[])[0]['time'] = '';
    expect(
      service.importDocument(
        'renamed.json',
        invalid,
        context,
        false,
        'aef:one.json',
      ).valid,
    ).toBeFalse();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
  });

  it('does not recreate a source that disappeared before renaming', () => {
    const service = createService();
    service.importDocument('one.json', document('first'), context);
    const before = localStorage.getItem('customRecipes');
    expect(
      service.importDocument(
        'renamed.json',
        document('first'),
        context,
        false,
        'aef:missing.json',
      ).valid,
    ).toBeFalse();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
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
    expect(JSON.parse(localStorage.getItem('customRecipes')!)).toEqual({
      aef: [],
    });
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

  it('exports all files including disabled recipes without changing their state', () => {
    const service = createService();
    const first = service.importDocument(
      'one.json',
      document('first'),
      context,
    );
    const second = service.importDocument(
      'two.json',
      document('second'),
      context,
    );
    service.setSourceEnabled('aef', first.source!.id, false);
    service.setRecipeEnabled('aef', second.source!.id, 'second', false);
    const before = localStorage.getItem('customRecipes');

    const shared = service.exportDocument('aef');
    expect(shared.recipes.map((recipe) => recipe.id)).toEqual([
      'first',
      'second',
    ]);
    expect(shared.format).toEqual(CUSTOM_RECIPE_FORMAT);
    expect(shared.modId).toEqual('aef');
    expect(service.exportDocument('other-mod').recipes).toEqual([]);
    expect(localStorage.getItem('customRecipes')).toEqual(before);

    service.clearMod('aef');
    const result = service.importDocument(
      'shared.json',
      JSON.parse(JSON.stringify(shared)),
      context,
    );
    expect(result.valid).toBeTrue();
    expect(result.source!.document.recipes).toEqual(shared.recipes);
  });

  it('validates edits without applying them and detects cross-file conflicts', () => {
    const service = createService();
    service.importDocument('one.json', document('first'), context);
    service.importDocument('two.json', document('second'), context);
    const before = localStorage.getItem('customRecipes');

    expect(
      service.validateDocument('one.json', document('first'), context).valid,
    ).toBeTrue();
    expect(
      service.validateDocument('one.json', document('second'), context).valid,
    ).toBeFalse();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
  });

  it('skips identical shared recipes while preserving existing enablement', () => {
    const service = createService();
    const first = service.importDocument(
      'one.json',
      document('first'),
      context,
    );
    service.setSourceEnabled('aef', first.source!.id, false);
    const shared = service.exportDocument('aef');
    shared.recipes = [
      ...shared.recipes,
      ...(document('second')['recipes'] as any[]),
    ];

    const result = service.importDocument('shared.json', shared, context, true);
    expect(result.valid).toBeTrue();
    expect(result.skippedRecipeIds).toEqual(['first']);
    expect(result.source!.document.recipes.map((recipe) => recipe.id)).toEqual([
      'second',
    ]);
    expect(service.sourcesForMod('aef')[0].enabled).toBeFalse();
  });

  it('does not add an empty file when every shared recipe already exists', () => {
    const service = createService();
    service.importDocument('one.json', document(), context);
    const before = localStorage.getItem('customRecipes');
    const result = service.importDocument(
      'shared.json',
      service.exportDocument('aef'),
      context,
      true,
    );

    expect(result.valid).toBeTrue();
    expect(result.source).toBeUndefined();
    expect(result.skippedRecipeIds).toEqual(['custom-recipe']);
    expect(localStorage.getItem('customRecipes')).toEqual(before);
  });

  it('rejects shared recipes with differing content without applying any changes', () => {
    const service = createService();
    service.importDocument('one.json', document(), context);
    const shared = JSON.parse(JSON.stringify(service.exportDocument('aef')));
    shared.recipes[0].name = 'Changed';
    const before = localStorage.getItem('customRecipes');

    expect(
      service.importDocument('shared.json', shared, context, true).valid,
    ).toBeFalse();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
  });

  describe('global library', () => {
    function library(): {
      service: CustomRecipeService;
      shared: CustomRecipeLibraryDocument;
    } {
      const service = createService();
      service.importDocument('one.json', document('first'), context);
      service.importDocument('two.json', document('second'), context);
      service.setSourceEnabled('aef', 'aef:one.json', false);
      service.setRecipeEnabled('aef', 'aef:two.json', 'second', false);
      service.setSourceStarred('aef', 'aef:two.json', true);
      return { service, shared: service.exportLibrary('aef', false) };
    }

    it('round-trips file grouping and all enablement without sharing storage references', () => {
      const { service, shared } = library();
      const before = localStorage.getItem('customRecipes');
      expect(shared.format).toEqual(CUSTOM_RECIPE_LIBRARY_FORMAT);
      expect(shared.enabled).toBeFalse();
      expect(shared.sources.map((source) => source.fileName)).toEqual([
        'one.json',
        'two.json',
      ]);
      expect(shared.sources[0].enabled).toBeFalse();
      expect(shared.sources[1].disabledRecipeIds).toEqual(['second']);
      expect(shared.sources[0].starred).toBeFalse();
      expect(shared.sources[1].starred).toBeTrue();
      shared.sources[0].recipes[0].name = 'Edited';
      expect(service.recipesForMod('aef')[0].name).toEqual('Custom recipe');
      expect(service.validateLibrary(shared, context).valid).toBeTrue();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(service.replaceLibrary(shared, context).valid).toBeTrue();
      shared.sources[0].recipes[0].name = 'Later edit';
      const restored = createService();
      expect(restored.recipesForMod('aef')[0].name).toEqual('Edited');
      expect(restored.sourcesForMod('aef')[0].enabled).toBeFalse();
      expect(restored.sourcesForMod('aef')[1].disabledRecipeIds).toEqual([
        'second',
      ]);
      expect(restored.sourcesForMod('aef')[1].starred).toBeTrue();
    });

    it('accepts older libraries without stars and normalizes them as unstarred', () => {
      const { service, shared } = library();
      for (const source of shared.sources) delete source.starred;
      const result = service.replaceLibrary(shared, context);
      expect(result.valid).toBeTrue();
      expect(result.document!.sources.map((source) => source.starred)).toEqual([
        false,
        false,
      ]);
      expect(
        service.sourcesForMod('aef').map((source) => source.starred),
      ).toEqual([false, false]);
    });

    it('rejects invalid library star values without modifying storage', () => {
      const { service, shared } = library();
      const before = localStorage.getItem('customRecipes');
      for (const starred of ['true', 1, null, {}]) {
        const value = {
          ...shared,
          sources: [{ ...shared.sources[0], starred }, shared.sources[1]],
        };
        const result = service.replaceLibrary(value, context);
        expect(result.valid).toBeFalse();
        expect(
          result.issues.some((issue) => issue.path === 'sources[0].starred'),
        ).toBeTrue();
        expect(localStorage.getItem('customRecipes')).toEqual(before);
      }
    });

    it('replaces omitted sources and allows editing existing IDs in the same transaction', () => {
      const { service, shared } = library();
      shared.sources.pop();
      shared.sources[0].recipes[0].name = 'Replacement';
      expect(service.replaceLibrary(shared, context).valid).toBeTrue();
      expect(service.sourcesForMod('aef').length).toEqual(1);
      expect(service.recipesForMod('aef')[0].name).toEqual('Replacement');
    });

    it('rejects cross-file duplicate IDs and leaves the entire stored library unchanged', () => {
      const { service, shared } = library();
      const before = localStorage.getItem('customRecipes');
      shared.sources[1].recipes[0].id = 'first';
      const result = service.replaceLibrary(shared, context);
      expect(result.valid).toBeFalse();
      expect(
        result.issues.some(
          (issue) => issue.path === 'sources[1].recipes[0].id',
        ),
      ).toBeTrue();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
    });

    it('rejects invalid headers, source names, switches and disabled references atomically', () => {
      const { service, shared } = library();
      const before = localStorage.getItem('customRecipes');
      const variants = [
        { ...shared, modId: 'other-mod' },
        { ...shared, version: 2 },
        { ...shared, enabled: 'true' },
        { ...shared, unknown: true },
        { ...shared, sources: {} },
        { ...shared, sources: [null] },
        {
          ...shared,
          sources: shared.sources.map((source) => ({
            ...source,
            fileName: 'same.json',
          })),
        },
        { ...shared, sources: [{ ...shared.sources[0], enabled: 'true' }] },
        {
          ...shared,
          sources: [{ ...shared.sources[0], fileName: ' file.json ' }],
        },
        {
          ...shared,
          sources: [{ ...shared.sources[0], disabledRecipeIds: ['missing'] }],
        },
        { ...shared, sources: [{ ...shared.sources[0], extra: true }] },
      ];
      for (const value of variants) {
        expect(service.replaceLibrary(value, context).valid).toBeFalse();
        expect(localStorage.getItem('customRecipes')).toEqual(before);
      }
    });

    it('rejects built-in ID collisions even when old custom sources are replaced', () => {
      const { service, shared } = library();
      shared.sources[0].recipes[0].id = 'existing-recipe';
      expect(service.replaceLibrary(shared, context).valid).toBeFalse();
    });

    it('accepts older recipe documents as a complete library', () => {
      const { service } = library();
      const result = service.replaceLibrary(document('legacy'), context, false);
      expect(result.valid).toBeTrue();
      expect(result.document!.enabled).toBeFalse();
      expect(service.recipesForMod('aef').map((recipe) => recipe.id)).toEqual([
        'legacy',
      ]);
    });

    it('recomputes generated items across sources without relying on removed sources', () => {
      const { service, shared } = library();
      for (const source of shared.sources)
        source.recipes[0].in = { 'new-item': 1 };
      expect(service.replaceLibrary(shared, context).valid).toBeTrue();
      expect(
        service
          .sourcesForMod('aef')
          .every((source) => source.generatedItemIds.includes('new-item')),
      ).toBeTrue();
      shared.sources.shift();
      service.replaceLibrary(shared, context);
      expect(
        service.generatedItemsForMod('aef').map((item) => item.id),
      ).toEqual(['new-item']);
      shared.sources[0].recipes[0].in = { 'input-item': 1 };
      service.replaceLibrary(shared, context);
      expect(service.generatedItemsForMod('aef')).toEqual([]);
    });

    it('keeps saved empty libraries empty on reload and does not restore the example', () => {
      const { service, shared } = library();
      shared.sources = [];
      service.replaceLibrary(shared, context);
      const restored = createService();
      restored.ensureBuiltInExample({
        ...context,
        machineIds: new Set(['thickener_1']),
      });
      expect(restored.sourcesForMod('aef')).toEqual([]);
      expect(restored.state()['aef']).toEqual([]);
    });

    it('creates defaults once and keeps the default example disabled', () => {
      const service = createService();
      const exampleContext = {
        ...context,
        machineIds: new Set(['thickener_1']),
      };
      const defaults = service.defaultLibrary('aef');
      expect(defaults.sources[0].recipes).toEqual(
        CUSTOM_RECIPE_EXAMPLE_DOCUMENT.recipes,
      );
      expect(defaults.sources[0].enabled).toBeFalse();
      expect(defaults.sources[0].starred).toBeFalse();
      service.ensureBuiltInExample(exampleContext);
      expect(service.sourcesForMod('aef').length).toEqual(1);
      const source = service.sourcesForMod('aef')[0];
      service.removeSource('aef', source.id);
      const restored = createService();
      restored.ensureBuiltInExample(exampleContext);
      expect(restored.sourcesForMod('aef')).toEqual([]);
      expect(
        service.validateLibrary(defaults, exampleContext).valid,
      ).toBeTrue();
    });

    it('does not affect other mods when replacing or clearing a library', () => {
      const { service, shared } = library();
      const otherContext = { ...context, modId: 'other' };
      service.importDocument(
        'other.json',
        { ...document('other-recipe'), modId: 'other' },
        otherContext,
      );
      shared.sources = [];
      service.replaceLibrary(shared, context);
      expect(service.recipesForMod('other').map((recipe) => recipe.id)).toEqual(
        ['other-recipe'],
      );
    });
  });
});
