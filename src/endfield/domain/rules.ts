import type {
  CalculationVariable,
  DerivedObjective,
  LinearRule,
  ModelRules,
  ModelVariableRef,
} from '~/extensions/calculation-extension';
import { Rational, rational } from '~/rational/rational';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';

import {
  copyResourceRecipeSettings,
  EndfieldState,
  ovenId,
  resourceIds,
  resourceLimitId,
  resourceObjectiveId,
  resourceOwner,
  resourceRecipes,
} from './model';

const transferKey = 'domain_key_tundra';
const hourlyTransfer = rational(1, 3600);

/** The fixed aef data's complete set of tundra transfer recipes. */
export const tundraTransferRecipeIds: readonly string[] = [
  'transfer_tundra_bottled_food_1',
  'transfer_tundra_bottled_food_2',
  'transfer_tundra_bottled_food_3',
  'transfer_tundra_bottled_rec_hp_1',
  'transfer_tundra_bottled_rec_hp_2',
  'transfer_tundra_bottled_rec_hp_3',
  'transfer_tundra_carbon_enr',
  'transfer_tundra_carbon_enr_powder',
  'transfer_tundra_carbon_mtl',
  'transfer_tundra_carbon_powder',
  'transfer_tundra_crystal_enr',
  'transfer_tundra_crystal_enr_powder',
  'transfer_tundra_crystal_powder',
  'transfer_tundra_crystal_shell',
  'transfer_tundra_equip_script_1',
  'transfer_tundra_equip_script_2',
  'transfer_tundra_equip_script_3',
  'transfer_tundra_glass_bottle',
  'transfer_tundra_glass_cmpt',
  'transfer_tundra_glass_enr_bottle',
  'transfer_tundra_glass_enr_cmpt',
  'transfer_tundra_iron_bottle',
  'transfer_tundra_iron_cmpt',
  'transfer_tundra_iron_enr',
  'transfer_tundra_iron_enr_bottle',
  'transfer_tundra_iron_enr_cmpt',
  'transfer_tundra_iron_enr_powder',
  'transfer_tundra_iron_nugget',
  'transfer_tundra_iron_powder',
  'transfer_tundra_originium_enr_powder',
  'transfer_tundra_originium_powder',
  'transfer_tundra_plant_bbflower_1',
  'transfer_tundra_plant_bbflower_powder_1',
  'transfer_tundra_plant_bbflower_seed_1',
  'transfer_tundra_plant_grass_1',
  'transfer_tundra_plant_grass_2',
  'transfer_tundra_plant_grass_powder_1',
  'transfer_tundra_plant_grass_powder_2',
  'transfer_tundra_plant_grass_seed_1',
  'transfer_tundra_plant_grass_seed_2',
  'transfer_tundra_plant_moss_1',
  'transfer_tundra_plant_moss_2',
  'transfer_tundra_plant_moss_3',
  'transfer_tundra_plant_moss_enr_powder_1',
  'transfer_tundra_plant_moss_enr_powder_2',
  'transfer_tundra_plant_moss_powder_1',
  'transfer_tundra_plant_moss_powder_2',
  'transfer_tundra_plant_moss_powder_3',
  'transfer_tundra_plant_moss_seed_1',
  'transfer_tundra_plant_moss_seed_2',
  'transfer_tundra_plant_moss_seed_3',
  'transfer_tundra_proc_battery_1',
  'transfer_tundra_proc_battery_2',
  'transfer_tundra_proc_battery_3',
  'transfer_tundra_proc_bomb_1',
  'transfer_tundra_quartz_enr',
  'transfer_tundra_quartz_enr_powder',
  'transfer_tundra_quartz_glass',
  'transfer_tundra_quartz_powder',
];
const transferRecipes = new Set(tundraTransferRecipeIds);

/** Values with fixedOutput are physical rates until the caller prepares the recipe. */
export function deriveEndfieldObjectives(
  state: EndfieldState,
): DerivedObjective[] {
  const result: DerivedObjective[] = [];
  if (state.resourceLimits.enabled) {
    for (const id of resourceIds) {
      const owner = resourceOwner(id);
      const targetId = resourceRecipes[id];
      result.push({
        owner,
        objective: {
          id: resourceLimitId(id),
          targetId,
          value: rational.zero,
          unit: ObjectiveUnit.Machines,
          type: ObjectiveType.Limit,
        },
      });
      const rate = state.resourceLimits.rates[id];
      if (rate.gt(rational.zero)) {
        const settings = state.resourceRecipeSettings[id];
        result.push({
          owner,
          objective: {
            ...(settings == null ? {} : copyResourceRecipeSettings(settings)),
            id: resourceObjectiveId(id),
            targetId,
            value: rational.zero,
            unit: ObjectiveUnit.Machines,
            type: ObjectiveType.Output,
          },
          fixedOutput: { itemId: id, perSecond: rate },
        });
      }
    }
  }

  if (state.transfer.enabled) {
    result.push({
      owner: 'transfer:tundra',
      objective: {
        id: 'ef:transfer:tundra:input',
        targetId: transferKey,
        value: hourlyTransfer,
        unit: ObjectiveUnit.Items,
        type: ObjectiveType.Input,
      },
      fixedRate: hourlyTransfer,
    });
  }
  const transferLimit = state.transfer.enabled ? hourlyTransfer : rational.zero;
  result.push({
    owner: 'transfer:tundra',
    objective: {
      id: 'ef:transfer:tundra:limit',
      targetId: transferKey,
      value: transferLimit,
      unit: ObjectiveUnit.Items,
      type: ObjectiveType.Limit,
    },
    fixedRate: transferLimit,
  });
  return result;
}

/** Only variables actually present in the model can consume a shared budget. */
export function compileEndfieldRules(
  state: EndfieldState,
  variables: readonly CalculationVariable[],
): ModelRules {
  const constraints: LinearRule[] = [];
  const integers: ModelVariableRef[] = [];
  const integerKeys = new Set<string>();
  const addInteger = (ref: ModelVariableRef): void => {
    const key = JSON.stringify([ref.kind, ref.id]);
    if (!integerKeys.has(key)) {
      integers.push(ref);
      integerKeys.add(key);
    }
  };
  const terms = (
    selected: readonly CalculationVariable[],
  ): LinearRule['terms'] =>
    selected.map(({ ref }) => ({ ref, coefficient: rational.one }));

  for (const [machineId, limit] of Object.entries(state.machineLimits.limits)) {
    if (machineId !== ovenId)
      throw new Error(`Unknown machine limit ID: ${machineId}`);
    if (!(limit instanceof Rational) || limit.lt(rational.zero))
      throw new Error(`Invalid machine limit: ${machineId}`);
  }
  if (state.machineLimits.enabled) {
    const limit = state.machineLimits.limits[ovenId];
    if (limit == null) throw new Error(`Missing machine limit: ${ovenId}`);
    const selected = variables.filter(
      (variable) => variable.machineId === ovenId,
    );
    constraints.push({
      id: `ef:machine:${ovenId}`,
      source: 'machine-limit',
      terms: terms(selected),
      upper: limit,
    });
    for (const variable of selected) {
      if (variable.recipeId !== 'xiranite_enr_powder') addInteger(variable.ref);
    }
  }

  const transfer = variables.filter((variable) =>
    transferRecipes.has(variable.recipeId),
  );
  for (const variable of transfer) addInteger(variable.ref);
  constraints.push({
    id: 'ef:transfer:tundra',
    source: 'transfer',
    terms: terms(transfer),
    upper: state.transfer.enabled ? rational.one : rational.zero,
  });

  const water = variables.filter(
    (variable) => variable.recipeId === 'sewage-treat',
  );
  const waterExport = variables.filter(
    (variable) => variable.recipeId === 'sewage-treat-export',
  );
  constraints.push(
    {
      id: 'ef:water:local',
      source: 'water',
      terms: terms(water),
      upper: rational(3),
    },
    {
      id: 'ef:water:export',
      source: 'water',
      terms: terms(waterExport),
      upper: rational.one,
    },
    {
      id: 'ef:water:shared',
      source: 'water',
      terms: [
        ...terms(water),
        ...waterExport.map(({ ref }) => ({ ref, coefficient: rational(3) })),
      ],
      upper: rational(3),
    },
  );
  return { constraints, integers };
}
