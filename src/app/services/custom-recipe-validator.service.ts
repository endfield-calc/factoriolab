import { Injectable } from '@angular/core';

import { rational } from '~/models/rational';

import {
  CUSTOM_ITEM_CATEGORY_ID,
  CUSTOM_RECIPE_FORMAT,
  CUSTOM_RECIPE_VERSION,
  CustomItemJson,
  CustomItemType,
  CustomRecipeDocument,
  customRecipeEffects,
  customRecipeFlags,
  CustomRecipeValidationContext,
  CustomRecipeValidationIssue,
  CustomRecipeValidationResult,
} from '../models/custom-recipe';

type JsonObject = Record<string, unknown>;

const numericPart = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
const rationalPattern = new RegExp(
  `^(?:${numericPart}|${numericPart}(?:\\s+${numericPart})?\\s*/\\s*${numericPart})$`,
  'i',
);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const colorPattern = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;
const customItemTypes = new Set<CustomItemType>(['solid', 'liquid', 'gas']);
const recipeKeys = new Set([
  'id',
  'name',
  'category',
  'row',
  'time',
  'producers',
  'in',
  'out',
  'catalyst',
  'cost',
  'part',
  'usage',
  'disallowedEffects',
  'locations',
  'flags',
  'iconText',
  'iconBackground',
]);
const itemKeys = new Set([
  'id',
  'name',
  'category',
  'row',
  'type',
  'stack',
  'iconText',
  'iconBackground',
]);

@Injectable({
  providedIn: 'root',
})
export class CustomRecipeValidatorService {
  validate(
    value: unknown,
    context: CustomRecipeValidationContext,
  ): CustomRecipeValidationResult {
    const issues: CustomRecipeValidationIssue[] = [];

    if (!this.isObject(value)) {
      return {
        valid: false,
        unknownItemIds: [],
        issues: [{ path: '', message: 'Document must be an object' }],
      };
    }

    this.validateDocumentHeader(value, context, issues);

    const items = value['items'];
    const itemIds = new Set(context.itemIds);
    if (items !== undefined && !Array.isArray(items)) {
      issues.push({ path: 'items', message: 'Must be an array' });
    } else if (Array.isArray(items)) {
      const seenItems = new Set<string>();
      items.forEach((item, index) => {
        this.validateItem(
          item,
          `items[${String(index)}]`,
          context,
          seenItems,
          itemIds,
          issues,
        );
      });
    }

    const unknownItemIds = new Set<string>();
    const recipes = value['recipes'];
    if (!Array.isArray(recipes)) {
      issues.push({ path: 'recipes', message: 'Must be an array' });
    } else {
      const seen = new Set<string>();
      recipes.forEach((recipe, index) => {
        this.validateRecipe(
          recipe,
          `recipes[${String(index)}]`,
          context,
          seen,
          itemIds,
          unknownItemIds,
          issues,
        );
      });
    }

    return {
      valid: issues.length === 0,
      items:
        issues.length === 0 ? ((items ?? []) as CustomItemJson[]) : undefined,
      recipes:
        issues.length === 0
          ? (value as unknown as CustomRecipeDocument).recipes
          : undefined,
      unknownItemIds: [...unknownItemIds],
      issues,
    };
  }

  private validateDocumentHeader(
    value: JsonObject,
    context: CustomRecipeValidationContext,
    issues: CustomRecipeValidationIssue[],
  ): void {
    if (value['format'] !== CUSTOM_RECIPE_FORMAT)
      issues.push({
        path: 'format',
        message: `Must be "${CUSTOM_RECIPE_FORMAT}"`,
      });
    if (value['version'] !== CUSTOM_RECIPE_VERSION)
      issues.push({
        path: 'version',
        message: `Must be ${String(CUSTOM_RECIPE_VERSION)}`,
      });
    if (typeof value['modId'] !== 'string' || value['modId'] !== context.modId)
      issues.push({
        path: 'modId',
        message: `Must match the current mod "${context.modId}"`,
      });

    for (const key of Object.keys(value)) {
      if (!['format', 'version', 'modId', 'items', 'recipes'].includes(key))
        issues.push({ path: key, message: 'Unknown field' });
    }
  }

  private validateItem(
    value: unknown,
    path: string,
    context: CustomRecipeValidationContext,
    seen: Set<string>,
    itemIds: Set<string>,
    issues: CustomRecipeValidationIssue[],
  ): void {
    if (!this.isObject(value)) {
      issues.push({ path, message: 'Item must be an object' });
      return;
    }

    for (const key of Object.keys(value)) {
      if (!itemKeys.has(key))
        issues.push({ path: `${path}.${key}`, message: 'Unknown field' });
    }

    for (const key of ['id', 'name']) {
      if (value[key] === undefined)
        issues.push({ path: `${path}.${key}`, message: 'Required field' });
    }

    const id = this.stringValue(value['id']);
    if (id == null || !idPattern.test(id) || id.length > 80) {
      issues.push({
        path: `${path}.id`,
        message: 'Must be 1-80 characters using letters, numbers, "_" or "-"',
      });
    } else if (seen.has(id) || context.itemConflictIds?.has(id) === true) {
      issues.push({
        path: `${path}.id`,
        message: `Duplicate item id "${id}"`,
      });
    } else {
      seen.add(id);
      itemIds.add(id);
    }

    if (id != null && value['type'] !== undefined && !id.startsWith('v_'))
      issues.push({
        path: `${path}.id`,
        message: 'New custom item ids must start with "v_"',
      });

    if (this.stringValue(value['name']) == null)
      issues.push({
        path: `${path}.name`,
        message: 'Must be a non-empty string',
      });
    if (value['category'] !== undefined)
      this.validateReference(
        value['category'],
        `${path}.category`,
        new Set([...context.categoryIds, CUSTOM_ITEM_CATEGORY_ID]),
        'category',
        issues,
      );
    if (value['row'] !== undefined)
      this.validateInteger(value['row'], `${path}.row`, issues);
    if (
      value['type'] !== undefined &&
      (typeof value['type'] !== 'string' ||
        !customItemTypes.has(value['type'] as CustomItemType))
    )
      issues.push({
        path: `${path}.type`,
        message: 'Must be "solid", "liquid" or "gas"',
      });
    if (value['stack'] !== undefined)
      this.validateNumber(value['stack'], `${path}.stack`, 'positive', issues);
    this.validateIcon(value, path, issues);
  }

  private validateRecipe(
    value: unknown,
    path: string,
    context: CustomRecipeValidationContext,
    seen: Set<string>,
    itemIds: ReadonlySet<string>,
    unknownItemIds: Set<string>,
    issues: CustomRecipeValidationIssue[],
  ): void {
    if (!this.isObject(value)) {
      issues.push({ path, message: 'Recipe must be an object' });
      return;
    }

    for (const key of Object.keys(value)) {
      if (!recipeKeys.has(key)) {
        issues.push({
          path: `${path}.${key}`,
          message:
            key === 'icon'
              ? 'Image icons are not supported; use iconText instead'
              : 'Unknown field',
        });
      }
    }

    const required = [
      'id',
      'name',
      'category',
      'row',
      'time',
      'producers',
      'in',
      'out',
      'iconText',
    ];
    for (const key of required) {
      if (value[key] === undefined)
        issues.push({ path: `${path}.${key}`, message: 'Required field' });
    }

    const id = this.stringValue(value['id']);
    if (id == null || !idPattern.test(id) || id.length > 80) {
      issues.push({
        path: `${path}.id`,
        message: 'Must be 1-80 characters using letters, numbers, "_" or "-"',
      });
    } else if (seen.has(id) || context.recipeIds.has(id)) {
      issues.push({
        path: `${path}.id`,
        message: `Duplicate recipe id "${id}"`,
      });
    } else {
      seen.add(id);
    }

    if (this.stringValue(value['name']) == null)
      issues.push({
        path: `${path}.name`,
        message: 'Must be a non-empty string',
      });

    this.validateReference(
      value['category'],
      `${path}.category`,
      context.categoryIds,
      'category',
      issues,
    );
    this.validateInteger(value['row'], `${path}.row`, issues);
    this.validateNumber(value['time'], `${path}.time`, 'positive', issues);
    this.validateStringArray(
      value['producers'],
      `${path}.producers`,
      context.machineIds,
      'machine',
      true,
      issues,
    );
    this.validateEntityMap(
      value['in'],
      `${path}.in`,
      itemIds,
      unknownItemIds,
      issues,
    );
    this.validateEntityMap(
      value['out'],
      `${path}.out`,
      itemIds,
      unknownItemIds,
      issues,
    );
    if (value['catalyst'] !== undefined)
      this.validateEntityMap(
        value['catalyst'],
        `${path}.catalyst`,
        itemIds,
        unknownItemIds,
        issues,
      );

    if (value['cost'] !== undefined)
      this.validateNumber(value['cost'], `${path}.cost`, 'any', issues);
    if (value['usage'] !== undefined)
      this.validateNumber(
        value['usage'],
        `${path}.usage`,
        'non-negative',
        issues,
      );
    if (value['part'] !== undefined)
      this.validateItemReference(
        value['part'],
        `${path}.part`,
        itemIds,
        unknownItemIds,
        issues,
      );
    if (value['locations'] !== undefined)
      this.validateStringArray(
        value['locations'],
        `${path}.locations`,
        context.locationIds,
        'location',
        false,
        issues,
      );
    if (value['flags'] !== undefined)
      this.validateEnumArray(
        value['flags'],
        `${path}.flags`,
        customRecipeFlags,
        issues,
      );
    if (value['disallowedEffects'] !== undefined)
      this.validateEnumArray(
        value['disallowedEffects'],
        `${path}.disallowedEffects`,
        customRecipeEffects,
        issues,
      );

    this.validateIcon(value, path, issues);
  }

  private validateEntityMap(
    value: unknown,
    path: string,
    ids: ReadonlySet<string>,
    unknownItemIds: Set<string>,
    issues: CustomRecipeValidationIssue[],
  ): void {
    if (!this.isObject(value)) {
      issues.push({ path, message: 'Must be an object' });
      return;
    }

    for (const [id, amount] of Object.entries(value)) {
      this.validateItemReference(
        id,
        `${path}.${id}`,
        ids,
        unknownItemIds,
        issues,
      );
      this.validateNumber(amount, `${path}.${id}`, 'non-negative', issues);
    }
  }

  private validateItemReference(
    value: unknown,
    path: string,
    ids: ReadonlySet<string>,
    unknownItemIds: Set<string>,
    issues: CustomRecipeValidationIssue[],
  ): void {
    if (typeof value !== 'string' || !idPattern.test(value)) {
      issues.push({ path, message: 'Invalid item id' });
    } else if (!ids.has(value)) {
      unknownItemIds.add(value);
    }
  }

  private validateIcon(
    value: JsonObject,
    path: string,
    issues: CustomRecipeValidationIssue[],
  ): void {
    if (value['iconText'] !== undefined) {
      const iconText = this.stringValue(value['iconText']);
      if (
        iconText == null ||
        iconText.trim() !== iconText ||
        /\s/u.test(iconText) ||
        Array.from(iconText).length === 0 ||
        Array.from(iconText).length > 2
      )
        issues.push({
          path: `${path}.iconText`,
          message: 'Must contain one or two visible characters',
        });
    }

    if (value['iconBackground'] !== undefined) {
      const color = this.stringValue(value['iconBackground']);
      if (color == null || !colorPattern.test(color))
        issues.push({
          path: `${path}.iconBackground`,
          message: 'Must be a #RGB or #RRGGBB color',
        });
    }
  }

  private validateStringArray(
    value: unknown,
    path: string,
    ids: ReadonlySet<string>,
    label: string,
    required: boolean,
    issues: CustomRecipeValidationIssue[],
  ): void {
    if (!Array.isArray(value) || (required && value.length === 0)) {
      issues.push({
        path,
        message: required ? 'Must be a non-empty array' : 'Must be an array',
      });
      return;
    }

    value.forEach((entry, index) => {
      this.validateReference(
        entry,
        `${path}[${String(index)}]`,
        ids,
        label,
        issues,
      );
    });
  }

  private validateEnumArray(
    value: unknown,
    path: string,
    allowed: ReadonlySet<string>,
    issues: CustomRecipeValidationIssue[],
  ): void {
    if (!Array.isArray(value)) {
      issues.push({ path, message: 'Must be an array' });
      return;
    }

    value.forEach((entry, index) => {
      if (typeof entry !== 'string' || !allowed.has(entry))
        issues.push({
          path: `${path}[${String(index)}]`,
          message: 'Unknown value',
        });
    });
  }

  private validateReference(
    value: unknown,
    path: string,
    ids: ReadonlySet<string>,
    label: string,
    issues: CustomRecipeValidationIssue[],
  ): void {
    if (typeof value !== 'string' || !ids.has(value))
      issues.push({ path, message: `Unknown ${label} id` });
  }

  private validateInteger(
    value: unknown,
    path: string,
    issues: CustomRecipeValidationIssue[],
  ): void {
    const parsed = this.parseNumber(value);
    if (parsed == null || !Number.isInteger(parsed) || parsed < 0)
      issues.push({ path, message: 'Must be a non-negative integer' });
  }

  private validateNumber(
    value: unknown,
    path: string,
    range: 'any' | 'non-negative' | 'positive',
    issues: CustomRecipeValidationIssue[],
  ): void {
    const parsed = this.parseNumber(value);
    const invalidRange =
      parsed == null ||
      (range === 'non-negative' && parsed < 0) ||
      (range === 'positive' && parsed <= 0);
    if (invalidRange)
      issues.push({
        path,
        message:
          range === 'any' ? 'Must be a number' : `Must be a ${range} number`,
      });
  }

  private parseNumber(value: unknown): number | undefined {
    if (typeof value === 'number')
      return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string') return;

    const text = value.trim();
    if (!rationalPattern.test(text)) return;

    try {
      const parsed = rational(text).toNumber();
      return Number.isFinite(parsed) ? parsed : undefined;
    } catch {
      return;
    }
  }

  private stringValue(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length === 0) return;
    return value;
  }

  private isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
