import { Injectable, signal } from '@angular/core';

import { getStoredValue, storeValue } from '~/models/stored-signal';
import { Entities } from '~/models/utils';

import {
  CUSTOM_ITEM_CATEGORY_ID,
  CUSTOM_RECIPE_FORMAT,
  CUSTOM_RECIPE_VERSION,
  CustomItemEntry,
  CustomItemJson,
  CustomRecipeDocument,
  CustomRecipeEntry,
  CustomRecipeImportResult,
  CustomRecipeJson,
  CustomRecipeSource,
  CustomRecipeValidationContext,
  DEFAULT_CUSTOM_RECIPE_BACKGROUND,
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
    this.stateSignal.set({
      ...this.stateSignal(),
      [modId]: sources,
    });
    this.persist();
  }

  private sourceId(modId: string, fileName: string): string {
    return `${modId}:${fileName}`;
  }

  private persist(): void {
    storeValue(CUSTOM_RECIPE_STORAGE_KEY, JSON.stringify(this.stateSignal()));
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
            generatedItemIds: source.generatedItemIds ?? [],
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
        Array.isArray(value['generatedItemIds']))
    );
  }

  private normalizeItem(item: CustomItemJson): CustomItemJson {
    return {
      ...item,
      category: item.category ?? CUSTOM_ITEM_CATEGORY_ID,
      row: item.row ?? 999,
      iconText: item.iconText ?? this.firstCharacter(item.id),
      iconBackground: item.iconBackground ?? DEFAULT_CUSTOM_RECIPE_BACKGROUND,
    };
  }

  private createGeneratedItem(id: string): CustomItemJson {
    return this.normalizeItem({ id, name: id });
  }

  private firstCharacter(value: string): string {
    return Array.from(value)[0] ?? '?';
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
