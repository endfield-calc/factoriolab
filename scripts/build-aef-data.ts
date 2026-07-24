import fs from 'fs';

import { ItemJson } from '~/models/data/item';
import { ModData } from '~/models/data/mod-data';
import { RecipeJson } from '~/models/data/recipe';

import { getJsonData } from './helpers/file.helpers';

interface SimplifiedAefData {
  itemInsertAfter?: string;
  items: ItemJson[];
  recipes: RecipeJson[];
}

const dataPath = './src/data/aef';
const baseDataPath = `${dataPath}/base-data.json`;
const simplifiedDataPath = `${dataPath}/simplified-recipes.json`;
const outputDataPath = `${dataPath}/data.json`;

function assertNoDuplicateIds(entries: { id: string }[], label: string): void {
  const ids = new Set<string>();

  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate ${label} id: ${entry.id}`);
    }

    ids.add(entry.id);
  }
}

function assertNoCollisions(
  baseEntries: { id: string }[],
  simplifiedEntries: { id: string }[],
  label: string,
): void {
  const baseIds = new Set(baseEntries.map((entry) => entry.id));

  for (const entry of simplifiedEntries) {
    if (baseIds.has(entry.id)) {
      throw new Error(
        `Simplified ${label} id conflicts with base data: ${entry.id}`,
      );
    }
  }
}

function assertRecipeReferences(
  recipes: RecipeJson[],
  itemIds: Set<string>,
  machineIds: Set<string>,
  locationIds: Set<string>,
): void {
  for (const recipe of recipes) {
    if (!recipe.flags?.includes('simplified')) {
      throw new Error(`Simplified recipe is missing its flag: ${recipe.id}`);
    }

    for (const itemId of [
      ...Object.keys(recipe.in),
      ...Object.keys(recipe.out),
      ...Object.keys(recipe.catalyst ?? {}),
    ]) {
      if (!itemIds.has(itemId)) {
        throw new Error(
          `Simplified recipe ${recipe.id} references unknown item: ${itemId}`,
        );
      }
    }

    for (const machineId of recipe.producers) {
      if (!machineIds.has(machineId)) {
        throw new Error(
          `Simplified recipe ${recipe.id} references unknown machine: ${machineId}`,
        );
      }
    }

    for (const locationId of recipe.locations ?? []) {
      if (!locationIds.has(locationId)) {
        throw new Error(
          `Simplified recipe ${recipe.id} references unknown location: ${locationId}`,
        );
      }
    }
  }
}

const baseData = getJsonData(baseDataPath) as ModData;
const simplifiedData = getJsonData(simplifiedDataPath) as SimplifiedAefData;

assertNoDuplicateIds(baseData.items, 'base item');
assertNoDuplicateIds(baseData.recipes, 'base recipe');
assertNoDuplicateIds(simplifiedData.items, 'simplified item');
assertNoDuplicateIds(simplifiedData.recipes, 'simplified recipe');
assertNoCollisions(baseData.items, simplifiedData.items, 'item');
assertNoCollisions(baseData.recipes, simplifiedData.recipes, 'recipe');

const itemIds = new Set([
  ...baseData.items.map((item) => item.id),
  ...simplifiedData.items.map((item) => item.id),
]);
const machineIds = new Set(
  [...baseData.items, ...simplifiedData.items]
    .filter((item) => item.machine)
    .map((item) => item.id),
);
const locationIds = new Set((baseData.locations ?? []).map((item) => item.id));

assertRecipeReferences(
  simplifiedData.recipes,
  itemIds,
  machineIds,
  locationIds,
);

const mergedItems = [...baseData.items];
if (simplifiedData.items.length) {
  const insertAfter = simplifiedData.itemInsertAfter;
  const index = insertAfter
    ? mergedItems.findIndex((item) => item.id === insertAfter)
    : mergedItems.length - 1;

  if (insertAfter && index === -1) {
    throw new Error(`Cannot insert simplified items after: ${insertAfter}`);
  }

  mergedItems.splice(index + 1, 0, ...simplifiedData.items);
}

const mergedData: ModData = {
  ...baseData,
  items: mergedItems,
  recipes: [...baseData.recipes, ...simplifiedData.recipes],
};

fs.writeFileSync(outputDataPath, `${JSON.stringify(mergedData, null, 2)}\n`);
