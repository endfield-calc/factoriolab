import { Constraint, ConstraintProperties, Model, Variable } from 'glpk-ts';

import { Rational, rational } from '~/rational/rational';

import type { GlpkResult, GlpkReturnCode } from './glpk-result';
import type { SimplexState } from './simplex-state';

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
  readonly terms: readonly {
    readonly ref: ModelVariableRef;
    readonly coefficient: 1 | 3;
  }[];
  readonly upper: Rational;
}

export interface ModelRules {
  readonly constraints: readonly LinearRule[];
  readonly integers: readonly ModelVariableRef[];
}

/** The selected machine for each automatic recipe and a pure rule compiler. */
export interface CalculationModelContext {
  readonly recipeSettings: Readonly<
    Record<string, { readonly machineId?: string }>
  >;
  /** Inputs whose displayed quantity must reflect the solved consumption. */
  readonly actualInputIds?: ReadonlySet<string>;
  readonly compile: (variables: readonly CalculationVariable[]) => ModelRules;
}

export interface ModelSimplexState extends SimplexState {
  modelContext?: CalculationModelContext;
}

export type ModelGlpkResult = Omit<GlpkResult, 'returnCode'> & {
  returnCode?: GlpkReturnCode;
};

export interface ModelBinding {
  readonly description: CalculationVariable;
  readonly variable: Variable;
  /** Exact fixed value (lb = ub); otherwise the lower bound is zero. */
  readonly fixed?: Rational;
  /** Exact upper bound for a non-fixed column; fixed takes precedence. */
  readonly upper?: Rational;
}

export interface ModelRow {
  readonly name: string;
  readonly coeffs: readonly [Variable, number][];
  readonly lower?: number;
  readonly upper?: number;
}

interface ExactIntegerRow {
  readonly name: string;
  readonly coeffs: readonly [Variable, bigint][];
  readonly upper: bigint;
}

export interface BoundModelRules {
  readonly integerVariables: ReadonlySet<Variable>;
  readonly integerRows: readonly ExactIntegerRow[];
  readonly infeasible: boolean;
}

export type ModelRowProperties = Omit<
  ConstraintProperties,
  'coeffs' | 'name'
> & {
  name: string;
  coeffs: [Variable, number][];
};

/** Keep the actual coefficients for an independent check of the final solution. */
export function addModelRow(
  model: Model,
  properties: ModelRowProperties,
  rows: ModelRow[],
): Constraint {
  rows.push({
    name: properties.name,
    coeffs: properties.coeffs.slice(),
    lower: properties.lb,
    upper: properties.ub,
  });
  return model.addConstr(properties);
}

function refKey(ref: ModelVariableRef): string {
  return JSON.stringify([ref.kind, ref.id]);
}

/** Convert a rational at the GLPK boundary without silently losing its sign. */
export function finiteNumber(value: Rational, label: string): number {
  const number = value.toNumber();
  if (!Number.isFinite(number)) throw new Error(`Non-finite ${label}`);
  if (number === 0 && value.nonzero())
    throw new Error(`Unrepresentable ${label}: numeric underflow`);
  return number;
}

function floor(value: Rational): bigint {
  const result = value.p / value.q;
  return value.p < 0n && value.p % value.q !== 0n ? result - 1n : result;
}

function ceil(value: Rational): bigint {
  const result = value.p / value.q;
  return value.p > 0n && value.p % value.q !== 0n ? result + 1n : result;
}

function safeInteger(value: bigint, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new Error(`Integer ${label} exceeds safe numeric range`);
  return result;
}

/** Bind only actual model variables, with no product-specific knowledge. */
export function bindModelRules(
  model: Model,
  context: CalculationModelContext,
  bindings: readonly ModelBinding[],
  rows: ModelRow[],
): BoundModelRules {
  const byRef = new Map<string, ModelBinding>();
  const boundVariables = new Set<Variable>();
  for (const binding of bindings) {
    const key = refKey(binding.description.ref);
    if (byRef.has(key)) throw new Error(`Duplicate model binding: ${key}`);
    if (boundVariables.has(binding.variable))
      throw new Error(`Model variable bound more than once: ${key}`);
    byRef.set(key, binding);
    boundVariables.add(binding.variable);
  }

  const rules = context.compile(bindings.map(({ description }) => description));
  const lookup = (ref: ModelVariableRef): ModelBinding => {
    const key = refKey(ref);
    const binding = byRef.get(key);
    if (!binding) throw new Error(`Missing model binding: ${key}`);
    return binding;
  };

  // Classify all integer columns before constructing budget rows.
  const integerKeys = new Set<string>();
  const integers: { binding: ModelBinding; lower: number; upper?: number }[] =
    [];
  let infeasible = false;
  for (const ref of rules.integers) {
    const key = refKey(ref);
    if (integerKeys.has(key))
      throw new Error(`Duplicate integer binding: ${key}`);
    integerKeys.add(key);
    const binding = lookup(ref);
    const lower = ceil(binding.fixed ?? rational.zero);
    const exactUpper = binding.fixed ?? binding.upper;
    const upper = exactUpper === undefined ? undefined : floor(exactUpper);
    const numericLower = safeInteger(lower, `lower bound of ${key}`);
    const numericUpper =
      upper === undefined
        ? undefined
        : safeInteger(upper, `upper bound of ${key}`);
    if (upper !== undefined && lower > upper) infeasible = true;
    integers.push({ binding, lower: numericLower, upper: numericUpper });
  }

  const preparedRows: ModelRowProperties[] = [];
  const integerRows: ExactIntegerRow[] = [];
  for (const rule of rules.constraints) {
    const originalTerms: [Variable, number][] = [];
    const integerTerms: [Variable, number][] = [];
    let fixed = rational.zero;
    let hasFreeContinuous = false;
    const seen = new Set<string>();
    for (const term of rule.terms) {
      const key = refKey(term.ref);
      if (seen.has(key))
        throw new Error(`Duplicate term in ${rule.id}: ${key}`);
      seen.add(key);
      const binding = lookup(term.ref);
      const coefficient = term.coefficient;
      originalTerms.push([binding.variable, coefficient]);
      if (integerKeys.has(key)) {
        integerTerms.push([binding.variable, coefficient]);
      } else if (
        binding.fixed !== undefined ||
        binding.upper?.eq(rational.zero)
      ) {
        fixed = fixed.add(
          rational(coefficient).mul(binding.fixed ?? rational.zero),
        );
      } else {
        hasFreeContinuous = true;
      }
    }

    // Decide constants before converting the cap to a floating-point value.
    if (integerTerms.length === 0 && !hasFreeContinuous) {
      if (fixed.gt(rule.upper)) infeasible = true;
      continue;
    }

    if (hasFreeContinuous) {
      // Preserve the original numeric mixed row and its tolerance policy.
      preparedRows.push({
        name: rule.id,
        coeffs: originalTerms,
        ub: finiteNumber(rule.upper, `upper bound of ${rule.id}`),
      });
    }

    if (integerTerms.length > 0) {
      // Integer contributions have integral positive weights, so flooring the
      // exact residual is equivalent without free continuous terms and a
      // necessary projection when free continuous terms are present.
      const name = `${rule.id}:integer`;
      const upper = floor(rule.upper.sub(fixed));
      integerRows.push({
        name,
        coeffs: integerTerms.map(([variable, coefficient]) => [
          variable,
          BigInt(coefficient),
        ]),
        upper,
      });
      preparedRows.push({
        name,
        coeffs: integerTerms,
        ub: safeInteger(upper, `upper bound of ${name}`),
      });
    }
  }

  const integerVariables = new Set(
    integers.map(({ binding }) => binding.variable),
  );
  if (infeasible) return { integerVariables, integerRows, infeasible: true };
  for (const row of preparedRows) addModelRow(model, row, rows);
  for (const { binding, lower, upper } of integers) {
    // These exact safe integral bounds remain unchanged after binding.
    binding.variable.bounds = [lower, upper];
    binding.variable.type = 'integer';
  }
  return { integerVariables, integerRows, infeasible: false };
}

const SOLUTION_TOLERANCE = 1e-7;
export const INTEGER_TOLERANCE = 1e-7;

export function checkedModelValue(
  values: ReadonlyMap<Variable, number>,
  variable: Variable,
): number {
  const value = values.get(variable);
  if (value === undefined) throw new Error('Missing checked model variable');
  return value;
}

/** Validate every column, row and objective against one and the same solution. */
export function validateModelSolution(
  model: Model,
  rows: readonly ModelRow[],
  integerVariables: ReadonlySet<Variable>,
  integerRows: readonly ExactIntegerRow[],
  mip: boolean,
): { readonly cost: number; readonly values: ReadonlyMap<Variable, number> } {
  const valueOf = (variable: Variable): number =>
    mip ? variable.valueMIP : variable.value;
  const values = new Map<Variable, number>();
  const closeEnough = (actual: number, bound: number, scale: number): boolean =>
    Math.abs(actual - bound) <=
    SOLUTION_TOLERANCE * (1 + Math.max(Math.abs(bound), scale));
  let cost = 0;
  for (const variable of model.vars) {
    const raw = valueOf(variable);
    const coefficient = variable.obj;
    let value = raw;
    if (integerVariables.has(variable)) {
      value = Math.round(raw);
      if (
        !Number.isSafeInteger(value) ||
        Math.abs(raw - value) > INTEGER_TOLERANCE
      )
        throw new Error(
          `Solution violates integer constraint or safe range: ${variable.name}`,
        );
      if (variable.lb !== undefined && value < variable.lb)
        throw new Error(
          `Solution violates exact integer lower bound: ${variable.name}`,
        );
      if (variable.ub !== undefined && value > variable.ub)
        throw new Error(
          `Solution violates exact integer upper bound: ${variable.name}`,
        );
    } else {
      if (
        variable.lb != null &&
        value < variable.lb &&
        !closeEnough(value, variable.lb, Math.abs(value))
      )
        throw new Error(`Solution violates lower bound: ${variable.name}`);
      if (
        variable.ub != null &&
        value > variable.ub &&
        !closeEnough(value, variable.ub, Math.abs(value))
      )
        throw new Error(`Solution violates upper bound: ${variable.name}`);
    }
    values.set(variable, value);
    cost += coefficient * value;
  }
  for (const row of integerRows) {
    let activity = 0n;
    for (const [variable, coefficient] of row.coeffs) {
      const value = checkedModelValue(values, variable);
      activity += coefficient * BigInt(value);
    }
    if (activity > row.upper)
      throw new Error(
        `Solution violates exact integer upper constraint: ${row.name}`,
      );
  }
  for (const row of rows) {
    let activity = 0;
    let scale = 0;
    for (const [variable, coefficient] of row.coeffs) {
      const value = checkedModelValue(values, variable);
      const term = coefficient * value;
      activity += term;
      scale += Math.abs(term);
    }
    if (!Number.isFinite(activity) || !Number.isFinite(scale))
      throw new Error(`Non-finite solution row: ${row.name}`);
    if (
      row.lower != null &&
      activity < row.lower &&
      !closeEnough(activity, row.lower, scale)
    )
      throw new Error(`Solution violates lower constraint: ${row.name}`);
    if (
      row.upper != null &&
      activity > row.upper &&
      !closeEnough(activity, row.upper, scale)
    )
      throw new Error(`Solution violates upper constraint: ${row.name}`);
  }
  const objective = mip ? model.valueMIP : model.value;
  if (
    !Number.isFinite(cost) ||
    !Number.isFinite(objective) ||
    !closeEnough(cost, objective, Math.abs(cost))
  )
    throw new Error('Solution objective does not match recomputed cost');
  // Keep the LP objective; the MIP cost must use the normalized integer values.
  return { cost: mip ? cost : objective, values };
}
