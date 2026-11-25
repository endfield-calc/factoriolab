import { Rational, rational } from '~/rational/rational';

export interface EndfieldRecipeCostInput {
  readonly declaredCost?: Rational;
  readonly overrideCost?: Rational;
  /** The actual chosen machine, before recipe-specific usage adjustment. */
  readonly usage?: Rational;
  readonly area?: Rational;
  readonly recycling: boolean;
  readonly weights: {
    readonly factor: Rational;
    readonly machine: Rational;
    readonly footprint: Rational;
    readonly recycling: Rational;
  };
  readonly electric: Rational;
}

export function calculateEndfieldRecipeCost({
  declaredCost,
  overrideCost,
  usage,
  area,
  recycling,
  weights,
  electric,
}: EndfieldRecipeCostInput): Rational {
  let cost: Rational;
  if (overrideCost != null) cost = overrideCost;
  else if (declaredCost != null) cost = declaredCost.mul(weights.factor);
  else {
    cost = rational.zero;
    if (usage != null)
      cost = cost.add(weights.machine.mul(electric).mul(usage));
    // Footprint enables the area term; the machine weight prices each tile.
    if (weights.footprint.nonzero() && area != null)
      cost = cost.add(weights.machine.mul(area));
    if (cost.isZero()) cost = weights.machine;
  }
  return recycling ? cost.mul(weights.recycling) : cost;
}
