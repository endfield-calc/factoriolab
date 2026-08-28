import { ItemJson } from './data/item';
import { ModuleEffect } from './data/module';
import { RecipeFlag, RecipeJson } from './data/recipe';

export const CUSTOM_RECIPE_FORMAT = 'endfieldlab-custom-recipes';
export const CUSTOM_RECIPE_VERSION = 1;
export const DEFAULT_CUSTOM_RECIPE_BACKGROUND = '#64748b';
export const CUSTOM_ITEM_CATEGORY_ID = '__custom_items';
export const CUSTOM_ITEM_CATEGORY_NAME = '自定义物品';

export type CustomItemJson = Pick<
  ItemJson,
  'id' | 'name' | 'stack' | 'iconText' | 'iconBackground'
> & {
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

export interface CustomRecipeSource {
  id: string;
  fileName: string;
  document: CustomRecipeDocument;
  generatedItemIds: string[];
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
