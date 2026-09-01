import { Injectable, signal } from '@angular/core';

import { getStoredValue, storeValue } from '~/models/stored-signal';
import { Entities } from '~/models/utils';

import {
  CUSTOM_ITEM_CATEGORY_ID,
  CUSTOM_RECIPE_EXAMPLE_DOCUMENT,
  CUSTOM_RECIPE_EXAMPLE_FILE_NAME,
  CUSTOM_RECIPE_FORMAT,
  CUSTOM_RECIPE_VERSION,
  CustomItemEntry,
  CustomItemJson,
  CustomItemType,
  CustomRecipeDocument,
  CustomRecipeEntry,
  CustomRecipeImportResult,
  CustomRecipeJson,
  CustomRecipeSource,
  CustomRecipeValidationContext,
  DEFAULT_CUSTOM_RECIPE_BACKGROUND,
  DEFAULT_CUSTOM_RECIPE_ROW,
} from '../models/custom-recipe';
import { CustomRecipeValidatorService } from './custom-recipe-validator.service';

const CUSTOM_RECIPE_STORAGE_KEY = 'customRecipes';

export type CustomRecipeState = Entities<CustomRecipeSource[]>;

@Injectable({
  providedIn: 'root',
})
export class CustomRecipeService {
  private readonly stateSignal = signal(this.loadState());

  readonly state = this.stateSignal.asReadonly();

  constructor(private readonly validator: CustomRecipeValidatorService) {}

  ensureBuiltInExample(context: CustomRecipeValidationContext): void {
    const sources = this.sourcesForMod(context.modId);
    const sourceId = this.sourceId(
      context.modId,
      CUSTOM_RECIPE_EXAMPLE_FILE_NAME,
    );
    if (sources.some((source) => source.id === sourceId)) return;

    const result = this.importDocument(
      CUSTOM_RECIPE_EXAMPLE_FILE_NAME,
      CUSTOM_RECIPE_EXAMPLE_DOCUMENT,
      context,
    );
    if (result.valid && result.source)
      this.setSourceEnabled(context.modId, result.source.id, false);
  }

  importDocument(
    fileName: string,
    value: unknown,
    context: CustomRecipeValidationContext,
  ): CustomRecipeImportResult {
    const sourceId = this.sourceId(context.modId, fileName);
    const existingSources = this.stateSignal()[context.modId] ?? [];
    const recipeIds = new Set(context.recipeIds);
    const existingExplicitItemIds = new Set<string>();
    const existingGeneratedItemIds = new Set<string>();
    const knownItemIds = new Set(context.itemIds);

    for (const source of existingSources) {
      if (source.id === sourceId) continue;
      for (const recipe of source.document.recipes) recipeIds.add(recipe.id);
      for (const item of source.document.items ?? []) {
        knownItemIds.add(item.id);
        if (source.generatedItemIds?.includes(item.id))
          existingGeneratedItemIds.add(item.id);
        else existingExplicitItemIds.add(item.id);
      }
    }

    const validation = this.validator.validate(value, {
      ...context,
      recipeIds,
      itemIds: knownItemIds,
      itemConflictIds: new Set([
        ...context.itemIds,
        ...existingExplicitItemIds,
      ]),
    });
    if (
      !validation.valid ||
      validation.recipes == null ||
      validation.items == null
    )
      return {
        valid: false,
        fileName,
        issues: validation.issues,
      };

    const generatedItems = validation.unknownItemIds
      .filter((id) => !existingExplicitItemIds.has(id))
      .map((id) => this.createGeneratedItem(id));
    const items = [
      ...validation.items.map((item) => this.normalizeItem(item)),
      ...generatedItems,
    ];
    const recipes = validation.recipes.map((recipe) => ({
      ...recipe,
      iconBackground: recipe.iconBackground ?? DEFAULT_CUSTOM_RECIPE_BACKGROUND,
    }));
    const previousSource = existingSources.find(
      (source) => source.id === sourceId,
    );
    const recipeIdSet = new Set(recipes.map((recipe) => recipe.id));
    const document: CustomRecipeDocument = {
      format: CUSTOM_RECIPE_FORMAT,
      version: CUSTOM_RECIPE_VERSION,
      modId: context.modId,
      items,
      recipes,
    };
    const source: CustomRecipeSource = {
      id: sourceId,
      fileName,
      document,
      generatedItemIds: [
        ...generatedItems.map((item) => item.id),
        ...validation.unknownItemIds.filter((id) =>
          existingGeneratedItemIds.has(id),
        ),
      ],
      enabled: previousSource?.enabled ?? true,
      disabledRecipeIds: (previousSource?.disabledRecipeIds ?? []).filter(
        (id) => recipeIdSet.has(id),
      ),
    };
    const nextSources = existingSources.filter(
      (entry) => entry.id !== sourceId,
    );
    nextSources.push(source);

    this.setSources(context.modId, nextSources);
    return {
      valid: true,
      fileName,
      source,
      issues: [],
    };
  }

  async importFiles(
    files: readonly File[],
    context: CustomRecipeValidationContext,
  ): Promise<CustomRecipeImportResult[]> {
    const results: CustomRecipeImportResult[] = [];
    for (const [index, file] of files.entries()) {
      const fileName = file.name || `custom-recipes-${String(index + 1)}.json`;
      try {
        results.push(
          this.importDocument(fileName, JSON.parse(await file.text()), context),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid JSON';
        results.push({
          valid: false,
          fileName,
          issues: [{ path: '', message: `Invalid JSON: ${message}` }],
        });
      }
    }
    return results;
  }

  sourcesForMod(modId: string): CustomRecipeSource[] {
    return this.stateSignal()[modId] ?? [];
  }

  recipesForMod(modId: string): CustomRecipeJson[] {
    return this.sourcesForMod(modId).flatMap(
      (source) => source.document.recipes,
    );
  }

  itemsForMod(modId: string): CustomItemJson[] {
    const items = new Map<string, CustomItemJson>();
    for (const source of this.sourcesForMod(modId))
      for (const item of source.document.items ?? []) items.set(item.id, item);
    return [...items.values()];
  }

  itemEntriesForMod(modId: string): CustomItemEntry[] {
    return this.sourcesForMod(modId).flatMap((source) =>
      (source.document.items ?? []).map((item) => ({
        sourceId: source.id,
        fileName: source.fileName,
        item,
        generated: source.generatedItemIds?.includes(item.id) ?? false,
      })),
    );
  }

  entriesForMod(modId: string): CustomRecipeEntry[] {
    return this.sourcesForMod(modId).flatMap((source) =>
      source.document.recipes.map((recipe) => ({
        sourceId: source.id,
        fileName: source.fileName,
        recipe,
      })),
    );
  }

  sourceEnabled(source: CustomRecipeSource): boolean {
    return source.enabled !== false;
  }

  recipeEnabled(source: CustomRecipeSource, recipeId: string): boolean {
    return (
      this.sourceEnabled(source) &&
      !(source.disabledRecipeIds ?? []).includes(recipeId)
    );
  }

  enabledRecipeCount(source: CustomRecipeSource): number {
    return source.document.recipes.filter((recipe) =>
      this.recipeEnabled(source, recipe.id),
    ).length;
  }

  excludedRecipeIdsForMod(modId: string): Set<string> {
    const result = new Set<string>();
    for (const source of this.sourcesForMod(modId)) {
      for (const recipe of source.document.recipes) {
        if (!this.recipeEnabled(source, recipe.id)) result.add(recipe.id);
      }
    }
    return result;
  }

  setSourceEnabled(modId: string, sourceId: string, enabled: boolean): void {
    const sources = this.sourcesForMod(modId);
    const source = sources.find((entry) => entry.id === sourceId);
    if (!source || this.sourceEnabled(source) === enabled) return;

    this.setSources(
      modId,
      sources.map((entry) =>
        entry.id === sourceId ? { ...entry, enabled } : entry,
      ),
    );
  }

  setRecipeEnabled(
    modId: string,
    sourceId: string,
    recipeId: string,
    enabled: boolean,
  ): void {
    const sources = this.sourcesForMod(modId);
    const source = sources.find((entry) => entry.id === sourceId);
    if (!source?.document.recipes.some((r) => r.id === recipeId)) return;

    const disabledRecipeIds = new Set(source.disabledRecipeIds ?? []);
    if (enabled) disabledRecipeIds.delete(recipeId);
    else disabledRecipeIds.add(recipeId);

    const nextDisabledRecipeIds = [...disabledRecipeIds].filter((id) =>
      source.document.recipes.some((recipe) => recipe.id === id),
    );
    this.setSources(
      modId,
      sources.map((entry) =>
        entry.id === sourceId
          ? {
              ...entry,
              disabledRecipeIds: nextDisabledRecipeIds,
            }
          : entry,
      ),
    );
  }

  removeSource(modId: string, sourceId: string): void {
    const sources = this.sourcesForMod(modId);
    if (!sources.some((source) => source.id === sourceId)) return;
    this.setSources(
      modId,
      sources.filter((source) => source.id !== sourceId),
    );
  }

  clearMod(modId: string): void {
    if (this.stateSignal()[modId] == null) return;
    const state = { ...this.stateSignal() };
    delete state[modId];
    this.stateSignal.set(state);
    this.persist();
  }

  private setSources(modId: string, sources: CustomRecipeSource[]): void {
    const state = { ...this.stateSignal() };
    if (sources.length) state[modId] = sources;
    else delete state[modId];
    this.stateSignal.set(state);
    this.persist();
  }

  private sourceId(modId: string, fileName: string): string {
    return `${modId}:${fileName}`;
  }

  private persist(): void {
    const state = this.stateSignal();
    storeValue(
      CUSTOM_RECIPE_STORAGE_KEY,
      Object.keys(state).length ? JSON.stringify(state) : undefined,
    );
  }

  private loadState(): CustomRecipeState {
    const stored = getStoredValue(CUSTOM_RECIPE_STORAGE_KEY);
    if (!stored) return {};

    try {
      const value: unknown = JSON.parse(stored);
      if (!this.isObject(value)) return {};

      const state: CustomRecipeState = {};
      for (const [modId, sources] of Object.entries(value)) {
        if (!Array.isArray(sources)) continue;
        const validSources = sources
          .filter((source) => this.isStoredSource(source, modId))
          .map((source) => ({
            ...source,
            document: {
              ...source.document,
              items: (source.document.items ?? []).map((item) =>
                this.normalizeItem(item),
              ),
            },
            generatedItemIds: source.generatedItemIds ?? [],
            enabled: source.enabled !== false,
            disabledRecipeIds: (source.disabledRecipeIds ?? []).filter((id) =>
              source.document.recipes.some((recipe) => recipe.id === id),
            ),
          }));
        if (validSources.length) state[modId] = validSources;
      }
      return state;
    } catch (error) {
      console.warn('Failed to parse stored custom recipes', error);
      return {};
    }
  }

  private isStoredSource(
    value: unknown,
    modId: string,
  ): value is CustomRecipeSource {
    if (!this.isObject(value)) return false;
    if (
      typeof value['id'] !== 'string' ||
      typeof value['fileName'] !== 'string'
    )
      return false;
    const document = value['document'];
    return (
      this.isObject(document) &&
      document['format'] === CUSTOM_RECIPE_FORMAT &&
      document['version'] === CUSTOM_RECIPE_VERSION &&
      document['modId'] === modId &&
      Array.isArray(document['recipes']) &&
      (document['items'] === undefined || Array.isArray(document['items'])) &&
      (value['generatedItemIds'] === undefined ||
        Array.isArray(value['generatedItemIds'])) &&
      (value['enabled'] === undefined ||
        typeof value['enabled'] === 'boolean') &&
      (value['disabledRecipeIds'] === undefined ||
        (Array.isArray(value['disabledRecipeIds']) &&
          value['disabledRecipeIds'].every((id) => typeof id === 'string')))
    );
  }

  private normalizeItem(item: CustomItemJson): CustomItemJson {
    const { stack: _legacyStack, ...itemWithoutStack } = item;
    return {
      ...itemWithoutStack,
      type: item.type ?? this.inferItemType(item),
      category: item.category ?? CUSTOM_ITEM_CATEGORY_ID,
      row: item.row ?? DEFAULT_CUSTOM_RECIPE_ROW,
      iconText: item.iconText ?? this.firstCharacter(item.id),
      iconBackground: item.iconBackground ?? DEFAULT_CUSTOM_RECIPE_BACKGROUND,
    };
  }

  private createGeneratedItem(id: string): CustomItemJson {
    return this.normalizeItem({ id, name: id });
  }

  private inferItemType(item: CustomItemJson): CustomItemType {
    if (item.stack != null) return 'solid';

    const id = item.id.toLocaleLowerCase();
    const name = item.name;
    if (
      id.startsWith('gas_') ||
      id.endsWith('_gas') ||
      /气体|气态|气$/u.test(name)
    )
      return 'gas';
    return 'liquid';
  }

  private firstCharacter(value: string): string {
    return Array.from(value)[0] ?? '?';
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
