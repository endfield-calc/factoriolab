import {
  AdjustedRecipe,
  finalizeRecipe,
  parseRecipe,
} from '~/data/schema/recipe';
import { rational } from '~/rational/rational';
import { AdjustedDataset } from '~/state/settings/dataset';
import { Settings } from '~/state/settings/settings';

import { EndfieldState } from './model';

export interface EndfieldTransferData {
  schemaVersion: 1;
  sources: { domainId: string; locationId: string; capacity: number }[];
  items: { itemId: string; value: number; sourceDomainIds: string[] }[];
}

export function transferSourceOptions(
  transfer: EndfieldTransferData | undefined,
  locations: ReadonlySet<string>,
): EndfieldTransferData['sources'] {
  return (transfer?.sources ?? []).filter((source) =>
    Array.from(locations).some((location) => location !== source.locationId),
  );
}

/** Add transfer recipes only to the adjusted calculation data, never to the catalog. */
export function addEndfieldTransferRecipes(
  data: AdjustedDataset,
  settings: Settings,
  state: EndfieldState,
  transfer: EndfieldTransferData | undefined,
): { data: AdjustedDataset; recipeIds: ReadonlySet<string> } {
  const recipeIds = new Set<string>();
  if (!state.transferEnabled || !transfer) return { data, recipeIds };
  const source = transferSourceOptions(transfer, settings.locationIds).find(
    (candidate) => candidate.locationId === state.transferSource,
  );
  if (!source) return { data, recipeIds };
  const recipeRecord = { ...data.recipeRecord };
  const adjustedRecipe = { ...data.adjustedRecipe };
  const itemAvailableRecipeIds = { ...data.itemAvailableRecipeIds };
  const itemAvailableIoRecipeIds = { ...data.itemAvailableIoRecipeIds };
  const recipeIcons = { ...data.iconRecord.recipe };
  for (const item of transfer.items) {
    // The table names source domains; any selected destination can receive them.
    if (
      !item.sourceDomainIds.includes(source.domainId) ||
      !data.itemRecord[item.itemId]
    )
      continue;
    const id = `__endfield_transfer_${source.locationId}_${item.itemId}`;
    if (recipeRecord[id]) throw new Error(`Duplicate transfer recipe: ${id}`);
    const parsed = parseRecipe({
      id,
      name: `${data.itemRecord[item.itemId].name} (${data.locationRecord[source.locationId]?.name ?? source.locationId})`,
      icon: item.itemId,
      time: 3600,
      in: {},
      out: {
        [item.itemId]: rational(source.capacity)
          .div(rational(item.value))
          .toFraction(false),
      },
    });
    const recipe: AdjustedRecipe = {
      ...parsed,
      cost: settings.costs.machine,
      effects: {
        consumption: rational.one,
        pollution: rational.one,
        productivity: rational.one,
        quality: rational.zero,
        speed: rational.one,
      },
      produces: new Set(),
      output: {},
    };
    finalizeRecipe(recipe);
    recipeRecord[id] = recipe;
    adjustedRecipe[id] = recipe;
    recipeIds.add(id);
    recipeIcons[id] = data.iconRecord.item[item.itemId];
    itemAvailableRecipeIds[item.itemId] = [
      ...itemAvailableRecipeIds[item.itemId],
      id,
    ];
    itemAvailableIoRecipeIds[item.itemId] = [
      ...itemAvailableIoRecipeIds[item.itemId],
      id,
    ];
  }
  return {
    recipeIds,
    data: {
      ...data,
      recipeRecord,
      adjustedRecipe,
      itemAvailableRecipeIds,
      itemAvailableIoRecipeIds,
      iconRecord: { ...data.iconRecord, recipe: recipeIcons },
    },
  };
}
