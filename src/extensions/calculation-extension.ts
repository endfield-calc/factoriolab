import { InjectionToken } from '@angular/core';

import { AdjustedRecipe, Recipe } from '~/data/schema/recipe';
import { Rational } from '~/rational/rational';
import {
  ObjectiveSettings,
  ObjectiveState,
} from '~/state/objectives/objective';
import { RecipeSettings } from '~/state/recipes/recipe-settings';
import { AdjustedDataset } from '~/state/settings/dataset';
import { Settings } from '~/state/settings/settings';

import { ReadonlyValue } from './immutable';

/** Semantic references deliberately contain no solver-library objects. */
export interface ModelVariableRef {
  readonly kind: 'recipe' | 'objective';
  readonly id: string;
}

export interface CalculationVariable {
  readonly ref: ModelVariableRef;
  readonly recipeId: string;
  readonly machineId?: string;
  readonly recipe: ReadonlyValue<AdjustedRecipe>;
}

export interface LinearRule {
  readonly id: string;
  readonly source: string;
  readonly terms: readonly {
    readonly ref: ModelVariableRef;
    readonly coefficient: Rational;
  }[];
  readonly lower?: Rational;
  readonly upper?: Rational;
}

export interface ModelRules {
  readonly constraints: readonly LinearRule[];
  readonly integers: readonly ModelVariableRef[];
}

/** Prepared settings and a pure compiler for the variables actually in a model. */
export interface CalculationModelContext {
  readonly recipeSettings: ReadonlyValue<Record<string, RecipeSettings>>;
  readonly compile: (variables: readonly CalculationVariable[]) => ModelRules;
}

export interface DerivedObjective {
  readonly objective: ReadonlyValue<ObjectiveState>;
  readonly owner: string;
  /** A physical rate; caller converts using the fully adjusted objective recipe. */
  readonly fixedOutput?: {
    readonly itemId: string;
    readonly perSecond: Rational;
  };
  /** An item input/limit already expressed per second, independent of display rate. */
  readonly fixedRate?: Rational;
}

export interface CalculationInput {
  readonly data: ReadonlyValue<AdjustedDataset>;
  readonly settings: ReadonlyValue<Settings>;
  readonly recipeSettings: ReadonlyValue<Record<string, RecipeSettings>>;
  readonly objectives: ReadonlyValue<ObjectiveSettings[]>;
  readonly extension: unknown;
}

export interface RecipeCostInput {
  readonly raw: ReadonlyValue<Recipe>;
  readonly adjusted: ReadonlyValue<AdjustedRecipe>;
  readonly recipeSettings: ReadonlyValue<RecipeSettings>;
  readonly settings: ReadonlyValue<Settings>;
  readonly data: ReadonlyValue<AdjustedDataset>;
  readonly extension: unknown;
}

/** Implementations take values only: never inject Adjustment/Normalization/stores here. */
export interface CalculationExtension {
  derive(input: CalculationInput): readonly DerivedObjective[];
  cost(input: RecipeCostInput): Rational | undefined;
  rules(
    input: CalculationInput,
    variables: readonly CalculationVariable[],
  ): ModelRules;
}

export const emptyModelRules: ModelRules = { constraints: [], integers: [] };
export const upstreamCalculation: CalculationExtension = {
  derive: () => [],
  cost: ({ adjusted }) => adjusted.cost,
  rules: () => emptyModelRules,
};
export const CALCULATION_EXTENSION = new InjectionToken<CalculationExtension>(
  'CALCULATION_EXTENSION',
  { factory: (): CalculationExtension => upstreamCalculation },
);
