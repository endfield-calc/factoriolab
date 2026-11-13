import { Machine } from '~/data/schema/machine';
import { Recipe } from '~/data/schema/recipe';
import type { ReadonlyValue } from '~/extensions/immutable';
import { Rational, rational } from '~/rational/rational';
import { RecipeSettings } from '~/state/recipes/recipe-settings';
import { CostSettings } from '~/state/settings/cost-settings';

export interface EndfieldRecipeCostInput {
  readonly raw: ReadonlyValue<Pick<Recipe, 'cost' | 'flags'>>;
  readonly recipeSettings: ReadonlyValue<Pick<RecipeSettings, 'cost'>>;
  /** The actual chosen machine, before recipe-specific usage adjustment. */
  readonly machine?: ReadonlyValue<Machine>;
  readonly costs: ReadonlyValue<CostSettings>;
  readonly electric: Rational;
}

export function calculateEndfieldRecipeCost({
  raw,
  recipeSettings,
  machine,
  costs,
  electric,
}: EndfieldRecipeCostInput): Rational {
  let cost: Rational;
  if (recipeSettings.cost != null) cost = recipeSettings.cost;
  else if (raw.cost != null) cost = raw.cost.mul(costs.factor);
  else {
    cost = rational.zero;
    if (machine?.usage != null)
      cost = cost.add(costs.machine.mul(electric).mul(machine.usage));
    if (costs.footprint.nonzero() && machine?.size != null)
      cost = cost.add(
        costs.machine
          .mul(rational(machine.size[0]))
          .mul(rational(machine.size[1])),
      );
    if (cost.isZero()) cost = costs.machine;
  }
  return raw.flags.has('recycling') ? cost.mul(costs.recycling) : cost;
}
