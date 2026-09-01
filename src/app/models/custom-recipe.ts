import { ItemJson } from './data/item';
import { ModuleEffect } from './data/module';
import { RecipeFlag, RecipeJson } from './data/recipe';

export const CUSTOM_RECIPE_FORMAT = 'endfieldlab-custom-recipes';
export const CUSTOM_RECIPE_VERSION = 1;
export const DEFAULT_CUSTOM_RECIPE_BACKGROUND = '#64748b';
export const DEFAULT_CUSTOM_RECIPE_ROW = 999;
export const CUSTOM_ITEM_CATEGORY_ID = '__custom_items';
export const CUSTOM_ITEM_CATEGORY_NAME = '自定义物品';
export const DEFAULT_CUSTOM_ITEM_STACK = 50;
export const CUSTOM_RECIPE_EXAMPLE_FILE_NAME = 'custom-recipes-example.json';

export type CustomItemType = 'solid' | 'liquid' | 'gas';

export type CustomItemJson = Pick<
  ItemJson,
  'id' | 'name' | 'iconText' | 'iconBackground'
> & {
  /** Required for newly saved items; omitted in legacy files. */
  type?: CustomItemType;
  /** Legacy field. It is read for compatibility and never exported by the editor. */
  stack?: number;
  category?: string;
  row?: number;
};

export type CustomRecipeJson = Omit<RecipeJson, 'icon' | 'iconText'> & {
  iconText: string;
};

export interface CustomRecipeDocument {
  format: typeof CUSTOM_RECIPE_FORMAT;
  version: typeof CUSTOM_RECIPE_VERSION;
  modId: string;
  items?: CustomItemJson[];
  recipes: CustomRecipeJson[];
}

export const CUSTOM_RECIPE_EXAMPLE_DOCUMENT: CustomRecipeDocument = {
  format: CUSTOM_RECIPE_FORMAT,
  version: CUSTOM_RECIPE_VERSION,
  modId: 'aef',
  recipes: [
    {
      id: 'v_recipe_example_simplified_originium_enr_powder',
      name: '示例-简化致密源石粉末',
      category: 'material',
      row: DEFAULT_CUSTOM_RECIPE_ROW,
      time: 2,
      producers: ['thickener_1'],
      in: {
        originium_ore: 2,
        plant_moss_powder_3: 1,
      },
      out: {
        originium_enr_powder: 1,
      },
      iconText: '示',
      iconBackground: DEFAULT_CUSTOM_RECIPE_BACKGROUND,
    },
  ],
};

export interface CustomRecipeSource {
  id: string;
  fileName: string;
  document: CustomRecipeDocument;
  generatedItemIds: string[];
  /** Whether all recipes from this source are enabled. Defaults to true. */
  enabled?: boolean;
  /** Recipe ids individually disabled while the source is enabled. */
  disabledRecipeIds?: string[];
}

export interface CustomRecipeEntry {
  sourceId: string;
  fileName: string;
  recipe: CustomRecipeJson;
}

export interface CustomItemEntry {
  sourceId: string;
  fileName: string;
  item: CustomItemJson;
  generated: boolean;
}

export interface CustomRecipeValidationContext {
  modId: string;
  recipeIds: ReadonlySet<string>;
  itemIds: ReadonlySet<string>;
  itemConflictIds?: ReadonlySet<string>;
  machineIds: ReadonlySet<string>;
  categoryIds: ReadonlySet<string>;
  locationIds: ReadonlySet<string>;
}

export interface CustomRecipeValidationIssue {
  path: string;
  message: string;
}

export interface CustomRecipeValidationResult {
  valid: boolean;
  items?: CustomItemJson[];
  recipes?: CustomRecipeJson[];
  unknownItemIds: string[];
  issues: CustomRecipeValidationIssue[];
}

export interface CustomRecipeImportResult {
  valid: boolean;
  fileName?: string;
  source?: CustomRecipeSource;
  issues: CustomRecipeValidationIssue[];
}

export const customRecipeFlags = new Set<RecipeFlag>([
  'mining',
  'technology',
  'burn',
  'grow',
  'recycling',
  'locked',
  'hideProducer',
  'canProdUpgrade',
  'forceShowLabel',
]);

export const customRecipeEffects = new Set<ModuleEffect>([
  'consumption',
  'pollution',
  'productivity',
  'quality',
  'speed',
]);
