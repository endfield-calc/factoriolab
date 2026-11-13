import { Machine } from '~/data/schema/machine';
import { RecipeFlag } from '~/data/schema/recipe';
import { rational } from '~/rational/rational';
import { initialSettingsState } from '~/state/settings/settings-state';

import { calculateEndfieldRecipeCost, EndfieldRecipeCostInput } from './cost';

describe('Endfield recipe costs', () => {
  const machine: Machine = { usage: rational(50), size: [5, 5] };
  const defaults = (): EndfieldRecipeCostInput => ({
    raw: { flags: new Set<RecipeFlag>() },
    recipeSettings: {},
    machine,
    costs: { ...initialSettingsState.costs, recycling: rational(1000) },
    electric: rational.one,
  });

  it('uses explicit user zero before raw costs, then applies recycling', () => {
    const input = defaults();
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        raw: { flags: new Set(['recycling']), cost: rational(-30) },
        recipeSettings: { cost: rational.zero },
      }),
    ).toEqual(rational.zero);
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        raw: { flags: new Set(['recycling']), cost: rational(2) },
      }),
    ).toEqual(rational(2000));
  });

  it('uses raw zero and negative declared cost regardless of output or machine', () => {
    const input = defaults();
    const costs = { ...input.costs, factor: rational(2) };
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        costs,
        raw: { flags: new Set(), cost: rational(-30) },
      }),
    ).toEqual(rational(-60));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        costs,
        raw: { flags: new Set(), cost: rational.zero },
      }),
    ).toEqual(rational.zero);
  });

  it('uses raw machine usage and treats footprint as an enable switch', () => {
    const input = defaults();
    expect(calculateEndfieldRecipeCost(input)).toEqual(rational(75));
    expect(
      calculateEndfieldRecipeCost({ ...input, electric: rational(2) }),
    ).toEqual(rational(125));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        costs: { ...input.costs, footprint: rational.zero },
      }),
    ).toEqual(rational(50));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        costs: { ...input.costs, footprint: rational(5) },
      }),
    ).toEqual(rational(75));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        machine: { usage: rational(-50) },
      }),
    ).toEqual(rational(-50));
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        electric: rational.zero,
        machine: {},
      }),
    ).toEqual(input.costs.machine);
    expect(
      calculateEndfieldRecipeCost({
        ...input,
        machine: { usage: rational(-25), size: [5, 5] },
      }),
    ).toEqual(input.costs.machine);
  });
});
