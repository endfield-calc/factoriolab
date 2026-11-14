import { Rational } from '~/rational/rational';
import { ObjectiveState } from '~/state/objectives/objective';
import { RecipeSettings } from '~/state/recipes/recipe-settings';

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
  readonly objective: Readonly<ObjectiveState>;
  /** A physical rate; caller converts using the fully adjusted objective recipe. */
  readonly fixedOutput?: {
    readonly itemId: string;
    readonly perSecond: Rational;
  };
  /** An item input/limit already expressed per second, independent of display rate. */
  readonly fixedRate?: Rational;
}
