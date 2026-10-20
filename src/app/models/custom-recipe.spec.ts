import endfieldJson from 'src/data/aef/data.json';

import { CUSTOM_RECIPE_SIMPLIFIED_DOCUMENT } from './custom-recipe';
import { ModData } from './data/mod-data';
import { parseRecipe } from './data/recipe';
import { Rational, rational } from './rational';

describe('simplified recipe material and energy balances', () => {
  const data = endfieldJson as unknown as ModData;
  const chains: Record<string, Record<string, number | string>> = {
    v_recipe_simplified_xiranite: {
      plant_grass_1: '1/2',
      plant_grass_seed_1: '1/2',
      'carbon_mtl-plant_grass_1': '1/2',
      'xiranite_powder-carbon_mtl': 1,
    },
    v_recipe_simplified_wuling_battery: {
      plant_moss_3: '40/3',
      plant_moss_seed_3: '20/3',
      plant_moss_powder_3: '20/3',
      originium_powder: 40,
      originium_enr_powder: 20,
      'iron_nugget-iron_ore': 5,
      iron_powder: 5,
      liquid_xiranite: 8,
      liquid_xiranite_poly: 8,
      'liquid_xiranite_poly-purifier': 2,
      xiranite_poly: 5,
      proc_battery_5: 1,
    },
    v_recipe_simplified_filter_core: {
      copper_jar: 1,
      filter_core: 1,
    },
  };

  for (const preset of CUSTOM_RECIPE_SIMPLIFIED_DOCUMENT.recipes) {
    it(`preserves every material and total energy in ${preset.name}`, () => {
      const balance: Record<string, Rational> = {};
      let energy = rational.zero;
      for (const [id, cycles] of Object.entries(chains[preset.id])) {
        const json = data.recipes.find((recipe) => recipe.id === id)!;
        const recipe = parseRecipe(json);
        const machine = data.items.find(
          (item) => item.id === recipe.producers[0],
        )!.machine!;
        for (const [itemId, amount] of Object.entries(recipe.in))
          balance[itemId] = (balance[itemId] ?? rational.zero).sub(
            amount.mul(rational(cycles)),
          );
        for (const [itemId, amount] of Object.entries(recipe.out))
          balance[itemId] = (balance[itemId] ?? rational.zero).add(
            amount.mul(rational(cycles)),
          );
        energy = energy.add(
          recipe.time
            .div(rational(machine.speed ?? 1))
            .mul(rational(cycles))
            .mul(recipe.usage ?? rational(machine.usage ?? 0)),
        );
      }

      const simplified = parseRecipe(preset);
      const expected: Record<string, Rational> = {};
      for (const [id, amount] of Object.entries(simplified.in))
        expected[id] = amount.inverse();
      for (const [id, amount] of Object.entries(simplified.out))
        expected[id] = (expected[id] ?? rational.zero).add(amount);
      expect(
        Object.fromEntries(
          Object.entries(balance).filter(([, amount]) => amount.nonzero()),
        ),
      ).toEqual(expected);
      expect(energy).toEqual(simplified.time.mul(simplified.usage!));
    });
  }
});
