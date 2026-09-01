import {
  CUSTOM_RECIPE_FORMAT,
  CUSTOM_RECIPE_VERSION,
  CustomRecipeValidationContext,
} from '~/models/custom-recipe';

import { CustomRecipeValidatorService } from './custom-recipe-validator.service';

describe('CustomRecipeValidatorService', () => {
  const service = new CustomRecipeValidatorService();
  const context: CustomRecipeValidationContext = {
    modId: 'aef',
    recipeIds: new Set(['existing-recipe']),
    itemIds: new Set(['input-item', 'output-item', 'machine-item']),
    machineIds: new Set(['machine-item']),
    categoryIds: new Set(['material']),
    locationIds: new Set(['tundra']),
  };

  function document(
    recipe: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      format: CUSTOM_RECIPE_FORMAT,
      version: CUSTOM_RECIPE_VERSION,
      modId: 'aef',
      recipes: [
        {
          id: 'custom-recipe',
          name: 'Custom recipe',
          category: 'material',
          row: 999,
          time: 2,
          producers: ['machine-item'],
          in: { 'input-item': 1 },
          out: { 'output-item': 2 },
          iconText: '自',
          iconBackground: '#3b82f6',
          ...recipe,
        },
      ],
    };
  }

  it('accepts a valid recipe document', () => {
    const result = service.validate(
      document({
        catalyst: { 'output-item': '1/2' },
        cost: '-30',
        usage: 50,
        part: 'output-item',
        locations: ['tundra'],
        flags: ['forceShowLabel'],
        disallowedEffects: ['speed'],
      }),
      context,
    );

    expect(result.valid).toBeTrue();
    expect(result.issues).toEqual([]);
    expect(result.recipes?.[0].iconBackground).toEqual('#3b82f6');
  });

  it('rejects mismatched document metadata', () => {
    const result = service.validate(
      {
        ...document(),
        format: 'other-format',
        version: 2,
        modId: '1.1',
      },
      context,
    );

    expect(result.valid).toBeFalse();
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'format',
      'version',
      'modId',
    ]);
  });

  it('rejects duplicate ids and unknown references', () => {
    const result = service.validate(
      document({
        id: 'existing-recipe',
        category: 'missing-category',
        producers: ['missing-machine'],
        in: { 'missing-item': 1 },
        out: { 'output-item': 1 },
      }),
      context,
    );

    expect(result.valid).toBeFalse();
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'recipes[0].id',
      'recipes[0].category',
      'recipes[0].producers[0]',
    ]);
    expect(result.unknownItemIds).toEqual(['missing-item']);
  });

  it('rejects image icons, invalid text icons, and invalid colors', () => {
    const result = service.validate(
      document({
        icon: 'output-item',
        iconText: 'ABC',
        iconBackground: 'red',
      }),
      context,
    );

    expect(result.valid).toBeFalse();
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'recipes[0].icon',
      'recipes[0].iconText',
      'recipes[0].iconBackground',
    ]);
  });

  it('rejects invalid quantities and unsupported enum values', () => {
    const result = service.validate(
      document({
        time: 0,
        in: { 'input-item': -1 },
        flags: ['unsupported'],
        disallowedEffects: ['unsupported'],
      }),
      context,
    );

    expect(result.valid).toBeFalse();
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'recipes[0].time',
      'recipes[0].in.input-item',
      'recipes[0].flags[0]',
      'recipes[0].disallowedEffects[0]',
    ]);
  });

  it('accepts unknown item references for automatic item creation', () => {
    const result = service.validate(
      document({ in: { 'new-material': 1 } }),
      context,
    );

    expect(result.valid).toBeTrue();
    expect(result.unknownItemIds).toEqual(['new-material']);
  });

  it('accepts one or two icon characters', () => {
    const result = service.validate(document({ iconText: 'AB' }), context);

    expect(result.valid).toBeTrue();
  });

  it('accepts item definitions without a category or icon', () => {
    const result = service.validate(
      {
        ...document(),
        items: [{ id: 'new-material', name: 'New material' }],
      },
      context,
    );

    expect(result.valid).toBeTrue();
    expect(result.items).toEqual([
      { id: 'new-material', name: 'New material' },
    ]);
  });

  it('accepts typed custom items with v_ ids', () => {
    const result = service.validate(
      {
        ...document(),
        items: [
          { id: 'v_solid', name: 'Solid', type: 'solid' },
          { id: 'v_liquid', name: 'Liquid', type: 'liquid' },
          { id: 'v_gas', name: 'Gas', type: 'gas' },
        ],
      },
      context,
    );

    expect(result.valid).toBeTrue();
    expect(result.issues).toEqual([]);
  });

  it('rejects typed custom items without a v_ id', () => {
    const result = service.validate(
      {
        ...document(),
        items: [{ id: 'solid', name: 'Solid', type: 'solid' }],
      },
      context,
    );

    expect(result.valid).toBeFalse();
    expect(result.issues.map((issue) => issue.path)).toEqual(['items[0].id']);
  });

  it('rejects unsupported custom item types', () => {
    const result = service.validate(
      {
        ...document(),
        items: [{ id: 'v_item', name: 'Item', type: 'powder' }],
      },
      context,
    );

    expect(result.valid).toBeFalse();
    expect(result.issues.map((issue) => issue.path)).toEqual(['items[0].type']);
  });
});
