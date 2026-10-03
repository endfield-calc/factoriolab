import { Injectable, signal } from '@angular/core';

import { getStoredValue, storeValue } from '~/models/stored-signal';
import { Entities } from '~/models/utils';

import {
  CUSTOM_RECIPE_EXAMPLE_DOCUMENT,
  CUSTOM_RECIPE_EXAMPLE_FILE_NAME,
  CUSTOM_RECIPE_FORMAT,
  CUSTOM_RECIPE_LIBRARY_FORMAT,
  CUSTOM_RECIPE_VERSION,
  CustomRecipeDocument,
  CustomRecipeEntry,
  CustomRecipeImportResult,
  CustomRecipeJson,
  CustomRecipeLibraryDocument,
  CustomRecipeLibraryValidationResult,
  CustomRecipeSource,
  CustomRecipeValidationContext,
  CustomRecipeValidationIssue,
  CustomRecipeValidationResult,
  DEFAULT_CUSTOM_RECIPE_BACKGROUND,
  DEFAULT_CUSTOM_RECIPE_ROW,
} from '../models/custom-recipe';
import { ItemJson } from '../models/data/item';
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
    // An explicit empty library is initialized too; do not restore deleted examples.
    if (Object.hasOwn(this.stateSignal(), context.modId)) return;
    this.replaceLibrary(this.defaultLibrary(context.modId), context);
  }

  importDocument(
    fileName: string,
    value: unknown,
    context: CustomRecipeValidationContext,
    skipIdentical = false,
    originalSourceId?: string,
  ): CustomRecipeImportResult {
    const sourceId = this.sourceId(context.modId, fileName);
    const replacedSourceId = originalSourceId ?? sourceId;
    const existingSources = this.stateSignal()[context.modId] ?? [];
    if (
      originalSourceId != null &&
      (!fileName.trim() ||
        fileName !== fileName.trim() ||
        !fileName.toLowerCase().endsWith('.json'))
    )
      return {
        valid: false,
        fileName,
        issues: [
          {
            path: 'fileName',
            message:
              'Must be a non-empty JSON file name without surrounding whitespace.',
          },
        ],
      };
    if (
      originalSourceId != null &&
      !existingSources.some((source) => source.id === originalSourceId)
    )
      return {
        valid: false,
        fileName,
        issues: [
          { path: 'fileName', message: 'The original file no longer exists.' },
        ],
      };
    if (
      sourceId !== replacedSourceId &&
      existingSources.some((source) => source.id === sourceId)
    )
      return {
        valid: false,
        fileName,
        issues: [
          {
            path: 'fileName',
            message: 'A file with this name already exists.',
          },
        ],
      };
    const validation = this.validateDocument(
      fileName,
      value,
      context,
      skipIdentical,
      originalSourceId,
    );
    if (!validation.valid || validation.recipes == null)
      return {
        valid: false,
        fileName,
        issues: validation.issues,
      };

    const otherRecipes = new Set(
      existingSources
        .filter((source) => source.id !== replacedSourceId)
        .flatMap((source) =>
          source.document.recipes.map((recipe) => this.recipeSignature(recipe)),
        ),
    );
    const skippedRecipeIds = skipIdentical
      ? validation.recipes
          .filter((recipe) => otherRecipes.has(this.recipeSignature(recipe)))
          .map((recipe) => recipe.id)
      : [];
    const recipes = validation.recipes
      .filter((recipe) => !skippedRecipeIds.includes(recipe.id))
      .map((recipe) => this.normalizeRecipe(recipe));
    if (skippedRecipeIds.length && !recipes.length)
      return { valid: true, fileName, issues: [], skippedRecipeIds };
    const previousSource = existingSources.find(
      (source) => source.id === replacedSourceId,
    );
    const recipeIdSet = new Set(recipes.map((recipe) => recipe.id));
    const document: CustomRecipeDocument = {
      format: CUSTOM_RECIPE_FORMAT,
      version: CUSTOM_RECIPE_VERSION,
      modId: context.modId,
      recipes,
    };
    const source: CustomRecipeSource = {
      id: sourceId,
      fileName,
      starred: previousSource?.starred ?? false,
      document,
      generatedItemIds: validation.unknownItemIds,
      enabled: previousSource?.enabled ?? true,
      disabledRecipeIds: (previousSource?.disabledRecipeIds ?? []).filter(
        (id) => recipeIdSet.has(id),
      ),
    };
    const nextSources = [...existingSources];
    const sourceIndex = nextSources.findIndex(
      (entry) => entry.id === replacedSourceId,
    );
    if (sourceIndex === -1) nextSources.push(source);
    else nextSources[sourceIndex] = source;

    this.setSources(context.modId, nextSources);
    return {
      valid: true,
      fileName,
      source,
      issues: [],
      ...(skippedRecipeIds.length ? { skippedRecipeIds } : {}),
    };
  }

  validateDocument(
    fileName: string,
    value: unknown,
    context: CustomRecipeValidationContext,
    allowIdentical = false,
    originalSourceId?: string,
  ): CustomRecipeValidationResult {
    const sourceId = originalSourceId ?? this.sourceId(context.modId, fileName);
    const recipeIds = new Set(context.recipeIds);
    const knownItemIds = new Set(context.itemIds);
    const incomingRecipes: unknown[] =
      this.isObject(value) && Array.isArray(value['recipes'])
        ? (value['recipes'] as unknown[])
        : [];
    const incomingSignatures = new Set(
      incomingRecipes.map((recipe) => this.recipeSignature(recipe)),
    );

    for (const source of this.sourcesForMod(context.modId)) {
      if (source.id === sourceId) continue;
      for (const recipe of source.document.recipes) {
        if (
          !allowIdentical ||
          !incomingSignatures.has(this.recipeSignature(recipe))
        )
          recipeIds.add(recipe.id);
      }
      for (const itemId of source.generatedItemIds ?? [])
        knownItemIds.add(itemId);
    }

    return this.validator.validate(value, {
      ...context,
      recipeIds,
      itemIds: knownItemIds,
    });
  }

  exportDocument(modId: string): CustomRecipeDocument {
    return {
      format: CUSTOM_RECIPE_FORMAT,
      version: CUSTOM_RECIPE_VERSION,
      modId,
      recipes: this.recipesForMod(modId),
    };
  }

  exportLibrary(modId: string, enabled = true): CustomRecipeLibraryDocument {
    return structuredClone({
      format: CUSTOM_RECIPE_LIBRARY_FORMAT,
      version: CUSTOM_RECIPE_VERSION,
      modId,
      enabled,
      sources: this.sourcesForMod(modId).map((source) => ({
        fileName: source.fileName,
        starred: source.starred === true,
        enabled: this.sourceEnabled(source),
        disabledRecipeIds: source.disabledRecipeIds ?? [],
        recipes: source.document.recipes,
      })),
    });
  }

  defaultLibrary(modId: string): CustomRecipeLibraryDocument {
    return {
      format: CUSTOM_RECIPE_LIBRARY_FORMAT,
      version: CUSTOM_RECIPE_VERSION,
      modId,
      enabled: true,
      sources:
        modId === CUSTOM_RECIPE_EXAMPLE_DOCUMENT.modId
          ? [
              {
                fileName: CUSTOM_RECIPE_EXAMPLE_FILE_NAME,
                starred: false,
                enabled: false,
                disabledRecipeIds: [],
                recipes: structuredClone(
                  CUSTOM_RECIPE_EXAMPLE_DOCUMENT.recipes,
                ),
              },
            ]
          : [],
    };
  }

  validateLibrary(
    value: unknown,
    context: CustomRecipeValidationContext,
    defaultEnabled = true,
  ): CustomRecipeLibraryValidationResult {
    const issues: CustomRecipeValidationIssue[] = [];
    if (!this.isObject(value))
      return {
        valid: false,
        issues: [{ path: '', message: 'Library must be an object' }],
      };

    // Keep older single-file and aggregated recipe documents paste-compatible.
    if (value['format'] === CUSTOM_RECIPE_FORMAT) {
      const validation = this.validator.validate(value, context);
      if (!validation.valid) return { valid: false, issues: validation.issues };
      return this.validateLibrary(
        {
          format: CUSTOM_RECIPE_LIBRARY_FORMAT,
          version: CUSTOM_RECIPE_VERSION,
          modId: context.modId,
          enabled: defaultEnabled,
          sources: [
            {
              fileName: 'custom-recipes.json',
              enabled: true,
              disabledRecipeIds: [],
              recipes: validation.recipes,
            },
          ],
        },
        context,
      );
    }

    for (const key of Object.keys(value))
      if (!['format', 'version', 'modId', 'enabled', 'sources'].includes(key))
        issues.push({ path: key, message: 'Unknown field' });
    if (value['format'] !== CUSTOM_RECIPE_LIBRARY_FORMAT)
      issues.push({
        path: 'format',
        message: `Must be "${CUSTOM_RECIPE_LIBRARY_FORMAT}"`,
      });
    if (value['version'] !== CUSTOM_RECIPE_VERSION)
      issues.push({
        path: 'version',
        message: `Must be ${String(CUSTOM_RECIPE_VERSION)}`,
      });
    if (value['modId'] !== context.modId)
      issues.push({
        path: 'modId',
        message: `Must match the current mod "${context.modId}"`,
      });
    if (typeof value['enabled'] !== 'boolean')
      issues.push({ path: 'enabled', message: 'Must be a boolean' });
    if (!Array.isArray(value['sources']))
      return {
        valid: false,
        issues: [...issues, { path: 'sources', message: 'Must be an array' }],
      };

    const sources: CustomRecipeSource[] = [];
    const names = new Set<string>();
    const recipeIds = new Set(context.recipeIds);
    value['sources'].forEach((entry: unknown, index: number) => {
      const path = `sources[${String(index)}]`;
      if (!this.isObject(entry)) {
        issues.push({ path, message: 'Source must be an object' });
        return;
      }
      for (const key of Object.keys(entry))
        if (
          ![
            'fileName',
            'starred',
            'enabled',
            'disabledRecipeIds',
            'recipes',
          ].includes(key)
        )
          issues.push({ path: `${path}.${key}`, message: 'Unknown field' });
      const fileName = entry['fileName'];
      if (
        typeof fileName !== 'string' ||
        !fileName.trim() ||
        fileName !== fileName.trim() ||
        !fileName.toLowerCase().endsWith('.json')
      )
        issues.push({
          path: `${path}.fileName`,
          message:
            'Must be a non-empty JSON file name without surrounding whitespace',
        });
      else if (names.has(fileName))
        issues.push({
          path: `${path}.fileName`,
          message: 'Duplicate file name',
        });
      else names.add(fileName);
      if (
        entry['starred'] !== undefined &&
        typeof entry['starred'] !== 'boolean'
      )
        issues.push({ path: `${path}.starred`, message: 'Must be a boolean' });
      if (typeof entry['enabled'] !== 'boolean')
        issues.push({ path: `${path}.enabled`, message: 'Must be a boolean' });

      const document = {
        format: CUSTOM_RECIPE_FORMAT,
        version: CUSTOM_RECIPE_VERSION,
        modId: context.modId,
        recipes: entry['recipes'],
      };
      const validation = this.validator.validate(document, {
        ...context,
        recipeIds,
      });
      issues.push(
        ...validation.issues.map((issue) => ({
          ...issue,
          path: `${path}.${issue.path}`,
        })),
      );
      if (Array.isArray(entry['recipes']))
        for (const recipe of entry['recipes'] as unknown[])
          if (this.isObject(recipe) && typeof recipe['id'] === 'string')
            recipeIds.add(recipe['id']);

      const disabled = entry['disabledRecipeIds'];
      const localIds = new Set(validation.recipes?.map((recipe) => recipe.id));
      if (!Array.isArray(disabled))
        issues.push({
          path: `${path}.disabledRecipeIds`,
          message: 'Must be an array',
        });
      else
        disabled.forEach((id: unknown, disabledIndex: number) => {
          if (typeof id !== 'string' || (validation.valid && !localIds.has(id)))
            issues.push({
              path: `${path}.disabledRecipeIds[${String(disabledIndex)}]`,
              message: 'Must reference a recipe in this source',
            });
        });

      if (
        validation.recipes &&
        typeof fileName === 'string' &&
        typeof entry['enabled'] === 'boolean' &&
        Array.isArray(disabled)
      )
        sources.push({
          id: this.sourceId(context.modId, fileName),
          fileName,
          starred: entry['starred'] === true,
          enabled: entry['enabled'],
          disabledRecipeIds: [...(disabled as string[])],
          generatedItemIds: validation.unknownItemIds,
          document: {
            format: CUSTOM_RECIPE_FORMAT,
            version: CUSTOM_RECIPE_VERSION,
            modId: context.modId,
            recipes: validation.recipes.map((recipe) =>
              this.normalizeRecipe(recipe),
            ),
          },
        });
    });
    if (issues.length) return { valid: false, issues };
    return {
      valid: true,
      issues: [],
      sources,
      document: {
        format: CUSTOM_RECIPE_LIBRARY_FORMAT,
        version: CUSTOM_RECIPE_VERSION,
        modId: context.modId,
        enabled: value['enabled'] as boolean,
        sources: sources.map((source) => ({
          fileName: source.fileName,
          starred: source.starred === true,
          enabled: source.enabled !== false,
          disabledRecipeIds: source.disabledRecipeIds ?? [],
          recipes: source.document.recipes,
        })),
      },
    };
  }

  replaceLibrary(
    value: unknown,
    context: CustomRecipeValidationContext,
    defaultEnabled = true,
  ): CustomRecipeLibraryValidationResult {
    const result = this.validateLibrary(value, context, defaultEnabled);
    if (result.valid && result.sources)
      this.setSources(context.modId, structuredClone(result.sources));
    return result;
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

  generatedItemsForMod(modId: string): ItemJson[] {
    const itemIds = new Set<string>();
    for (const source of this.sourcesForMod(modId))
      for (const itemId of source.generatedItemIds ?? []) itemIds.add(itemId);
    return [...itemIds].map((id) => this.createGeneratedItem(id));
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

  setSourceStarred(modId: string, sourceId: string, starred: boolean): void {
    const sources = this.sourcesForMod(modId);
    const source = sources.find((entry) => entry.id === sourceId);
    if (!source || (source.starred === true) === starred) return;

    this.setSources(
      modId,
      sources.map((entry) =>
        entry.id === sourceId ? { ...entry, starred } : entry,
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
    this.setSources(modId, []);
  }

  private setSources(modId: string, sources: CustomRecipeSource[]): void {
    const state = { ...this.stateSignal() };
    state[modId] = sources;
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
              recipes: source.document.recipes.map((recipe) =>
                this.normalizeRecipe(recipe),
              ),
            },
            generatedItemIds: source.generatedItemIds ?? [],
            starred: source.starred === true,
            enabled: source.enabled !== false,
            disabledRecipeIds: (source.disabledRecipeIds ?? []).filter((id) =>
              source.document.recipes.some((recipe) => recipe.id === id),
            ),
          }));
        state[modId] = validSources;
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
      document['recipes'].every((recipe) => this.isStoredRecipe(recipe)) &&
      (value['generatedItemIds'] === undefined ||
        Array.isArray(value['generatedItemIds'])) &&
      (value['starred'] === undefined ||
        typeof value['starred'] === 'boolean') &&
      (value['enabled'] === undefined ||
        typeof value['enabled'] === 'boolean') &&
      (value['disabledRecipeIds'] === undefined ||
        (Array.isArray(value['disabledRecipeIds']) &&
          value['disabledRecipeIds'].every((id) => typeof id === 'string')))
    );
  }

  private isStoredRecipe(value: unknown): value is CustomRecipeJson {
    if (!this.isObject(value) || !this.isObject(value['customRecipe']))
      return false;
    return (
      typeof value['customRecipe']['iconText'] === 'string' &&
      (value['customRecipe']['iconBackground'] === undefined ||
        typeof value['customRecipe']['iconBackground'] === 'string') &&
      (value['customRecipe']['iconId'] === undefined ||
        typeof value['customRecipe']['iconId'] === 'string')
    );
  }

  private normalizeRecipe(recipe: CustomRecipeJson): CustomRecipeJson {
    return {
      ...recipe,
      customRecipe: {
        ...recipe.customRecipe,
        iconBackground:
          recipe.customRecipe.iconBackground ??
          DEFAULT_CUSTOM_RECIPE_BACKGROUND,
      },
    };
  }

  private recipeSignature(recipe: unknown): string | undefined {
    return JSON.stringify(this.sortJson(recipe));
  }

  private sortJson(value: unknown): unknown {
    if (Array.isArray(value))
      return value.map((entry: unknown) => this.sortJson(entry));
    if (!this.isObject(value)) return value;
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, this.sortJson(entry)]),
    );
  }

  private createGeneratedItem(id: string): ItemJson {
    return {
      id,
      name: id,
      category: 'activity',
      row: DEFAULT_CUSTOM_RECIPE_ROW,
      iconText: this.firstCharacter(id),
    };
  }

  private firstCharacter(value: string): string {
    return Array.from(value)[0] ?? '?';
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
