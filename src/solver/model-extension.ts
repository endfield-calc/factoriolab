import {
  Constraint,
  ConstraintProperties,
  Model,
  Variable,
  VariableProperties,
} from 'glpk-ts';

import {
  CalculationModelContext,
  CalculationVariable,
  ModelVariableRef,
} from '~/extensions/calculation-extension';
import { immutableValue } from '~/extensions/immutable';
import { gcd, Rational, rational } from '~/rational/rational';

export interface ModelBinding {
  readonly description: CalculationVariable;
  readonly variable: Variable;
  /** Exact original bounds, before conversion to GLPK doubles. */
  readonly lower: Rational;
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
  readonly lower?: bigint;
  readonly upper?: bigint;
}

interface ExactOriginalRow {
  readonly name: string;
  readonly terms: readonly [ModelBinding, Rational][];
  readonly lower?: Rational;
  readonly upper?: Rational;
}

export interface BoundModelRules {
  readonly integerVariables: readonly Variable[];
  readonly integerBindings: readonly ModelBinding[];
  readonly integerRows: readonly ExactIntegerRow[];
  readonly originalRows: readonly ExactOriginalRow[];
  readonly infeasible: boolean;
}

export function addModelVariable(
  model: Model,
  properties: VariableProperties,
): Variable {
  for (const [label, value] of [
    ['objective', properties.obj],
    ['lower bound', properties.lb],
    ['upper bound', properties.ub],
  ] as const) {
    if (value !== undefined && !Number.isFinite(value))
      throw new Error(
        `Non-finite ${label} of model variable: ${properties.name ?? ''}`,
      );
  }
  return model.addVar(properties);
}

/** Keep the actual coefficients for an independent check of the final solution. */
export function addModelRow(
  model: Model,
  properties: ConstraintProperties,
  rows: ModelRow[],
): Constraint {
  const coeffs = properties.coeffs;
  if (coeffs == null || !Array.isArray(coeffs))
    throw new Error('A model row must use an explicit coefficient list');
  if (
    (properties.lb !== undefined && !Number.isFinite(properties.lb)) ||
    (properties.ub !== undefined && !Number.isFinite(properties.ub)) ||
    coeffs.some(([, coefficient]) => !Number.isFinite(coefficient))
  )
    throw new Error(`Non-finite model row: ${properties.name ?? ''}`);
  rows.push({
    name: properties.name ?? '',
    coeffs: coeffs.slice(),
    lower: properties.lb,
    upper: properties.ub,
  });
  return model.addConstr(properties);
}

function refKey(ref: ModelVariableRef): string {
  if (
    ref == null ||
    (ref.kind !== 'recipe' && ref.kind !== 'objective') ||
    typeof ref.id !== 'string' ||
    ref.id.length === 0
  )
    throw new Error('Invalid model variable reference');
  return JSON.stringify([ref.kind, ref.id]);
}

function finiteNumber(value: Rational, label: string): number {
  if (!(value instanceof Rational)) throw new Error(`Invalid ${label}`);
  const number = value.toNumber();
  if (!Number.isFinite(number)) throw new Error(`Non-finite ${label}`);
  if (number === 0 && value.nonzero())
    throw new Error(`Unrepresentable ${label}`);
  return number;
}

function exactRational(value: Rational, label: string): Rational {
  if (!(value instanceof Rational)) throw new Error(`Invalid ${label}`);
  return value;
}

function isArray(value: unknown): boolean {
  return Array.isArray(value);
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

/** Normalize a rational integer row onto its exact attainable lattice. */
function integerRow(
  name: string,
  terms: readonly [Variable, Rational][],
  lower: Rational | undefined,
  upper: Rational | undefined,
): { readonly exact: ExactIntegerRow; readonly numeric: ConstraintProperties } {
  let denominator = 1n;
  for (const [, coefficient] of terms)
    denominator =
      (denominator / gcd(denominator, coefficient.q)) * coefficient.q;
  const scaled = terms.map(([variable, coefficient]): [Variable, bigint] => [
    variable,
    coefficient.p * (denominator / coefficient.q),
  ]);
  const divisor = scaled.reduce(
    (result, [, coefficient]) => gcd(result, coefficient),
    0n,
  );
  if (divisor === 0n) throw new Error(`Empty integer row: ${name}`);
  const step = new Rational(divisor, denominator);
  const coeffs = scaled.map(([variable, coefficient]): [Variable, bigint] => [
    variable,
    coefficient / divisor,
  ]);
  const exactLower = lower === undefined ? undefined : ceil(lower.div(step));
  const exactUpper = upper === undefined ? undefined : floor(upper.div(step));
  const numeric: ConstraintProperties = {
    name,
    coeffs: coeffs.map(([variable, coefficient]) => [
      variable,
      safeInteger(coefficient, `coefficient of ${name}`),
    ]),
    lb:
      exactLower === undefined
        ? undefined
        : safeInteger(exactLower, `lower bound of ${name}`),
    ub:
      exactUpper === undefined
        ? undefined
        : safeInteger(exactUpper, `upper bound of ${name}`),
  };
  return {
    exact: { name, coeffs, lower: exactLower, upper: exactUpper },
    numeric,
  };
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

  const variables = immutableValue(
    bindings.map((binding) => binding.description),
  );
  const rules = immutableValue(context.compile(variables));
  if (!rules || !isArray(rules.constraints) || !isArray(rules.integers))
    throw new Error('Invalid model rules');

  const lookup = (ref: ModelVariableRef): ModelBinding => {
    const key = refKey(ref);
    const binding = byRef.get(key);
    if (!binding) throw new Error(`Missing model binding: ${key}`);
    return binding;
  };

  // Classify the complete integer set before examining any row.
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
    const lower = ceil(exactRational(binding.lower, `lower bound of ${key}`));
    const upper =
      binding.upper === undefined
        ? undefined
        : floor(exactRational(binding.upper, `upper bound of ${key}`));
    const numericLower = safeInteger(lower, `lower bound of ${key}`);
    const numericUpper =
      upper === undefined
        ? undefined
        : safeInteger(upper, `upper bound of ${key}`);
    if (upper !== undefined && lower > upper) infeasible = true;
    integers.push({ binding, lower: numericLower, upper: numericUpper });
  }

  const preparedRows: ConstraintProperties[] = [];
  const integerRows: ExactIntegerRow[] = [];
  const originalRows: ExactOriginalRow[] = [];
  const ruleIds = new Set<string>();
  for (const rule of rules.constraints) {
    if (
      !rule ||
      typeof rule.id !== 'string' ||
      rule.id.length === 0 ||
      typeof rule.source !== 'string' ||
      rule.source.length === 0 ||
      !isArray(rule.terms)
    )
      throw new Error('Invalid model constraint');
    if (ruleIds.has(rule.id))
      throw new Error(`Duplicate model constraint: ${rule.id}`);
    ruleIds.add(rule.id);
    const lower =
      rule.lower === undefined
        ? undefined
        : exactRational(rule.lower, `lower bound of ${rule.id}`);
    const upper =
      rule.upper === undefined
        ? undefined
        : exactRational(rule.upper, `upper bound of ${rule.id}`);
    if (rule.lower != null && rule.upper != null && rule.lower.gt(rule.upper))
      throw new Error(`Inverted bounds of model constraint: ${rule.id}`);

    const originalTerms: [ModelBinding, Rational][] = [];
    const integerTerms: [Variable, Rational][] = [];
    const continuousTerms: [ModelBinding, Rational][] = [];
    let fixed = rational.zero;
    const seen = new Set<string>();
    for (const term of rule.terms) {
      if (!term || typeof term !== 'object')
        throw new Error(`Invalid term in ${rule.id}`);
      const key = refKey(term.ref);
      if (seen.has(key))
        throw new Error(`Duplicate term in ${rule.id}: ${key}`);
      seen.add(key);
      const binding = lookup(term.ref);
      const coefficient = exactRational(
        term.coefficient,
        `coefficient in ${rule.id}`,
      );
      if (coefficient.isZero()) continue;
      originalTerms.push([binding, coefficient]);
      if (integerKeys.has(key)) {
        integerTerms.push([binding.variable, coefficient]);
      } else if (
        binding.upper !== undefined &&
        binding.lower.eq(binding.upper)
      ) {
        fixed = fixed.add(coefficient.mul(binding.lower));
      } else {
        continuousTerms.push([binding, coefficient]);
      }
    }
    originalRows.push({ name: rule.id, terms: originalTerms, lower, upper });
    const remainingLower = lower?.sub(fixed);
    const remainingUpper = upper?.sub(fixed);
    if (integerTerms.length === 0 && continuousTerms.length === 0) {
      if (
        remainingLower?.gt(rational.zero) ||
        remainingUpper?.lt(rational.zero)
      )
        infeasible = true;
      continue;
    }

    const addIntegerRow = (lo?: Rational, hi?: Rational): void => {
      if (lo === undefined && hi === undefined) return;
      const normalized = integerRow(`${rule.id}:integer`, integerTerms, lo, hi);
      if (
        normalized.exact.lower !== undefined &&
        normalized.exact.upper !== undefined &&
        normalized.exact.lower > normalized.exact.upper
      )
        infeasible = true;
      integerRows.push(normalized.exact);
      preparedRows.push(normalized.numeric);
    };

    if (continuousTerms.length === 0) {
      // Fixed continuous terms were moved exactly; the remaining lattice row
      // is equivalent for every integer assignment.
      addIntegerRow(remainingLower, remainingUpper);
      continue;
    }

    // Keep the original mixed/continuous row. Its floating-point continuous
    // part is checked with tolerance, not claimed as an exact certificate.
    const numericLower =
      lower === undefined
        ? undefined
        : finiteNumber(lower, `lower bound of ${rule.id}`);
    const numericUpper =
      upper === undefined
        ? undefined
        : finiteNumber(upper, `upper bound of ${rule.id}`);
    if (
      lower !== undefined &&
      upper !== undefined &&
      !lower.eq(upper) &&
      numericLower === numericUpper
    )
      throw new Error(
        `Indistinguishable bounds of model constraint: ${rule.id}`,
      );
    preparedRows.push({
      name: rule.id,
      coeffs: originalTerms.map(([binding, coefficient]) => [
        binding.variable,
        finiteNumber(coefficient, `coefficient in ${rule.id}`),
      ]),
      lb: numericLower,
      ub: numericUpper,
    });

    if (integerTerms.length === 0) continue;
    let minimum: Rational | undefined = rational.zero;
    let maximum: Rational | undefined = rational.zero;
    for (const [binding, coefficient] of continuousTerms) {
      const positive = coefficient.gt(rational.zero);
      const minBound = positive ? binding.lower : binding.upper;
      const maxBound = positive ? binding.upper : binding.lower;
      minimum =
        minimum === undefined || minBound === undefined
          ? undefined
          : minimum.add(coefficient.mul(minBound));
      maximum =
        maximum === undefined || maxBound === undefined
          ? undefined
          : maximum.add(coefficient.mul(maxBound));
    }
    // These are necessary box projections only; no coupled-row inference.
    addIntegerRow(
      remainingLower === undefined || maximum === undefined
        ? undefined
        : remainingLower.sub(maximum),
      remainingUpper === undefined || minimum === undefined
        ? undefined
        : remainingUpper.sub(minimum),
    );
  }

  const integerBindings = integers.map(({ binding }) => binding);
  const integerVariables = integerBindings.map(({ variable }) => variable);
  if (infeasible)
    return {
      integerVariables,
      integerBindings,
      integerRows,
      originalRows,
      infeasible: true,
    };
  for (const row of preparedRows) addModelRow(model, row, rows);
  for (const { binding, lower, upper } of integers) {
    // GLPK requires integral bounds on integer columns. Tightening bounds this
    // way is exactly equivalent over integers, including fractional limits.
    binding.variable.bounds = [lower, upper];
    binding.variable.type = 'integer';
  }
  return {
    integerVariables,
    integerBindings,
    integerRows,
    originalRows,
    infeasible: false,
  };
}

const SOLUTION_TOLERANCE = 1e-7;
export const INTEGER_TOLERANCE = 1e-7;

/** Validate every column, row and objective against one and the same solution. */
export function validateModelSolution(
  model: Model,
  rows: readonly ModelRow[],
  integerBindings: readonly ModelBinding[],
  integerRows: readonly ExactIntegerRow[],
  originalRows: readonly ExactOriginalRow[],
  mip: boolean,
): { readonly cost: number; readonly values: ReadonlyMap<Variable, number> } {
  const valueOf = (variable: Variable): number =>
    mip ? variable.valueMIP : variable.value;
  const integerByVariable = new Map(
    integerBindings.map((binding) => [binding.variable, binding]),
  );
  const values = new Map<Variable, number>();
  const closeEnough = (actual: number, bound: number, scale: number): boolean =>
    Math.abs(actual - bound) <=
    SOLUTION_TOLERANCE * (1 + Math.max(Math.abs(bound), scale));
  let cost = 0;
  for (const variable of model.vars) {
    const raw = valueOf(variable);
    const coefficient = variable.obj;
    if (!Number.isFinite(raw) || !Number.isFinite(coefficient))
      throw new Error(
        `Non-finite solution value or objective coefficient: ${variable.name}`,
      );
    const binding = integerByVariable.get(variable);
    let value = raw;
    if (binding) {
      value = Math.round(raw);
      if (
        !Number.isSafeInteger(value) ||
        Math.abs(raw - value) > INTEGER_TOLERANCE
      )
        throw new Error(
          `Solution violates integer constraint or safe range: ${variable.name}`,
        );
      const exact = new Rational(BigInt(value));
      if (exact.lt(binding.lower))
        throw new Error(
          `Solution violates exact integer lower bound: ${variable.name}`,
        );
      if (binding.upper !== undefined && exact.gt(binding.upper))
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
      const value = values.get(variable);
      if (value === undefined || !integerByVariable.has(variable))
        throw new Error(`Invalid exact integer row: ${row.name}`);
      activity += coefficient * BigInt(value);
    }
    if (row.lower !== undefined && activity < row.lower)
      throw new Error(
        `Solution violates exact integer lower constraint: ${row.name}`,
      );
    if (row.upper !== undefined && activity > row.upper)
      throw new Error(
        `Solution violates exact integer upper constraint: ${row.name}`,
      );
  }
  for (const row of originalRows) {
    let activity = rational.zero;
    let exact = true;
    for (const [binding, coefficient] of row.terms) {
      let value: Rational;
      if (integerByVariable.has(binding.variable)) {
        const integer = values.get(binding.variable);
        if (integer === undefined)
          throw new Error(`Invalid exact row: ${row.name}`);
        value = new Rational(BigInt(integer));
      } else if (
        binding.upper !== undefined &&
        binding.lower.eq(binding.upper)
      ) {
        value = binding.lower;
      } else {
        exact = false;
        break;
      }
      activity = activity.add(coefficient.mul(value));
    }
    if (exact && row.lower !== undefined && activity.lt(row.lower))
      throw new Error(
        `Solution violates exact original lower constraint: ${row.name}`,
      );
    if (exact && row.upper !== undefined && activity.gt(row.upper))
      throw new Error(
        `Solution violates exact original upper constraint: ${row.name}`,
      );
  }
  for (const row of rows) {
    let activity = 0;
    let scale = 0;
    for (const [variable, coefficient] of row.coeffs) {
      const value = values.get(variable);
      if (value == null || !Number.isFinite(coefficient))
        throw new Error(`Invalid solution row: ${row.name}`);
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
  return { cost, values };
}
