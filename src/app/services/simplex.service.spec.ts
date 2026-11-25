import { TestBed } from '@angular/core/testing';

import {
  AdjustedRecipe,
  finalizeRecipe,
  parseRecipe,
  RecipeJson,
} from '~/models/data/recipe';
import { MaximizeType } from '~/models/enum/maximize-type';
import { ObjectiveType } from '~/models/enum/objective-type';
import { ObjectiveUnit } from '~/models/enum/objective-unit';
import { SimplexResultType } from '~/models/enum/simplex-result-type';
import { ObjectiveState } from '~/models/objective';
import { rational } from '~/models/rational';
import { Entities } from '~/models/utils';
import { ItemId, Mocks, RecipeId, TestModule } from '~/tests';

import aefData from '../../data/aef/data.json';
import {
  ItemValues,
  MatrixSolution,
  MatrixState,
  SimplexService,
} from './simplex.service';

describe('SimplexService', () => {
  let service: SimplexService;
  const getState = (): MatrixState => ({
    objectives: [],
    recipeObjectives: [],
    steps: [],
    recipes: {},
    itemValues: {},
    recipeLimits: {},
    unproduceableIds: new Set(),
    excludedIds: new Set(),
    itemIds: Mocks.adjustedDataset.itemIds,
    data: Mocks.adjustedDataset,
    maximizeType: MaximizeType.Weight,
    requireMachinesOutput: true,
    costs: {
      factor: rational.one,
      machine: rational.one,
      recycling: rational(1000n),
      footprint: rational.one,
      unproduceable: rational(1000000n),
      excluded: rational.zero,
      surplus: rational.zero,
      maximize: rational(-1000000n),
      electric: rational.one,
    },
    hasSurplusCost: false,
  });
  const getResult = (
    resultType: SimplexResultType = SimplexResultType.Solved,
  ): MatrixSolution => ({
    resultType,
    time: 2,
    cost: rational.one,
    itemIds: [],
    recipeIds: [],
    unproduceableIds: new Set(),
    excludedIds: new Set(),
    surplus: {},
    unproduceable: {},
    excluded: {},
    recipes: {},
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    service = TestBed.inject(SimplexService);
  });

  describe('addItemValue', () => {
    it('should add a value to an entity of Rationals', () => {
      const result: Entities<ItemValues> = {};
      service.addItemValue(result, 'id');
      expect(result['id'].out).toEqual(rational.zero);
      service.addItemValue(result, 'id', rational.one);
      expect(result['id'].out).toEqual(rational.one);
      service.addItemValue(result, 'id', rational(2n), 'lim');
      expect(result['id'].lim).toEqual(rational(2n));
    });
  });

  describe('solve', () => {
    it('should handle calculations paused', () => {
      expect(
        service.solve(
          [],
          Mocks.settingsStateInitial,
          Mocks.adjustedDataset,
          true,
        ),
      ).toEqual({ steps: [], resultType: SimplexResultType.Paused });
    });

    it('should handle empty list of objectives', () => {
      expect(
        service.solve(
          [],
          Mocks.settingsStateInitial,
          Mocks.adjustedDataset,
          false,
        ),
      ).toEqual({
        steps: [],
        resultType: SimplexResultType.Skipped,
      });
    });

    it('should update steps with solution from simplex method', () => {
      spyOn(service, 'getState').and.returnValue({
        steps: Mocks.steps,
      } as any);
      const result = getResult(SimplexResultType.Solved);
      spyOn(service, 'getSolution').and.returnValue(result);
      spyOn(service, 'updateSteps');
      expect(
        service.solve(
          Mocks.objectives,
          Mocks.settingsStateInitial,
          Mocks.adjustedDataset,
          false,
        ),
      ).toEqual({
        steps: Mocks.steps,
        resultType: SimplexResultType.Solved,
        returnCode: undefined,
        simplexStatus: undefined,
        unboundedRecipeId: undefined,
        time: 2,
        cost: rational.one,
      });
      expect(service.updateSteps).toHaveBeenCalled();
    });

    it('should determine the unbounded ray result', () => {
      const result = service.solve(
        [
          {
            id: '0',
            targetId: RecipeId.AdvancedCircuit,
            value: rational.one,
            unit: ObjectiveUnit.Items,
            type: ObjectiveType.Maximize,
          },
        ],
        Mocks.settingsStateInitial,
        Mocks.adjustedDataset,
        false,
      );
      expect(result.unboundedRecipeId).toBeDefined();
    });

    it('enables only valid transfer keys and disables every other source', () => {
      const data = {
        ...Mocks.adjustedDataset,
        locationIds: ['tundra', 'jinlong', 'missing'],
        itemEntities: {
          ...Mocks.adjustedDataset.itemEntities,
          domain_key_tundra: {
            id: 'domain_key_tundra',
            name: '',
            category: '__domain_transfer',
            row: 0,
          },
          domain_key_jinlong: {
            id: 'domain_key_jinlong',
            name: '',
            category: '__domain_transfer',
            row: 0,
          },
        },
      };
      const settings = {
        ...Mocks.settingsStateInitial,
        modId: 'aef',
        locationIds: new Set(['tundra', 'jinlong']),
      };
      const getMatrix = spyOn(service, 'getState').and.returnValue(getState());
      spyOn(service, 'getSolution').and.returnValue(getResult());
      spyOn(service, 'updateSteps');
      const transfer = (targetId: string): ObjectiveState => ({
        id: targetId,
        targetId,
        type: ObjectiveType.DomainTransfer,
        unit: ObjectiveUnit.Items,
        value: rational.one,
      });
      const output = Mocks.objectives[0];
      const generated = (): ObjectiveState[] =>
        getMatrix.calls.mostRecent().args[0].slice(1);

      service.solve([output], settings, data, false);
      expect(generated().map((o) => [o.targetId, o.type, o.value])).toEqual([
        ['domain_key_tundra', ObjectiveType.Limit, rational.zero],
        ['domain_key_jinlong', ObjectiveType.Limit, rational.zero],
      ]);

      service.solve(
        [
          output,
          transfer('domain_key_unknown'),
          transfer('domain_key_jinlong'),
          transfer('domain_key_jinlong'),
        ],
        settings,
        data,
        false,
      );
      expect(generated().map((o) => [o.targetId, o.type, o.value])).toEqual([
        ['domain_key_jinlong', ObjectiveType.Limit, rational(1, 3600)],
        ['domain_key_jinlong', ObjectiveType.Input, rational(1, 3600)],
        ['domain_key_tundra', ObjectiveType.Limit, rational.zero],
      ]);

      service.solve(
        [output, transfer('domain_key_tundra'), transfer('domain_key_jinlong')],
        settings,
        data,
        false,
      );
      expect(generated().map((o) => [o.targetId, o.type])).toEqual([
        ['domain_key_tundra', ObjectiveType.Limit],
        ['domain_key_tundra', ObjectiveType.Input],
        ['domain_key_jinlong', ObjectiveType.Limit],
        ['domain_key_jinlong', ObjectiveType.Input],
      ]);

      for (const locationIds of [
        new Set<string>(),
        new Set(['tundra']),
        new Set(['unknown']),
      ]) {
        service.solve(
          [output, transfer('domain_key_tundra')],
          { ...settings, locationIds },
          data,
          false,
        );
        expect(generated().map((o) => [o.targetId, o.type, o.value])).toEqual([
          ['domain_key_tundra', ObjectiveType.Limit, rational.zero],
          ['domain_key_jinlong', ObjectiveType.Limit, rational.zero],
        ]);
      }

      const { domain_key_jinlong: _removed, ...oldItems } = data.itemEntities;
      service.solve(
        [output, transfer('domain_key_tundra')],
        settings,
        {
          ...data,
          itemEntities: oldItems,
        },
        false,
      );
      expect(generated().map((o) => [o.targetId, o.type, o.value])).toEqual([
        ['domain_key_tundra', ObjectiveType.Limit, rational(1, 3600)],
        ['domain_key_tundra', ObjectiveType.Input, rational(1, 3600)],
      ]);
    });
  });

  describe('transfer integer constraints', () => {
    function transferState(): MatrixState {
      const state = getState();
      const keys = ['domain_key_tundra', 'domain_key_jinlong'];
      const products = ['product_a', 'product_b'];
      const recipes: Entities<AdjustedRecipe> = {};
      for (const source of ['tundra', 'jinlong']) {
        for (const product of products) {
          const id = `transfer_${source}_${product}`;
          const key = `domain_key_${source}`;
          recipes[id] = {
            ...Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperOre],
            id,
            time: rational(3600),
            producers: ['__domain_transfer'],
            in: { [key]: rational.one },
            out: { [product]: rational(150) },
            output: {
              [key]: rational(-1, 3600),
              [product]: rational(150, 3600),
            },
            produces: new Set([product]),
            cost: rational.one,
          };
        }
      }
      state.recipes = recipes;
      state.data = {
        ...Mocks.adjustedDataset,
        modId: 'aef',
        itemAvailableIoRecipeIds: Object.fromEntries(
          [...keys, ...products].map((item) => [
            item,
            Object.values(recipes)
              .filter((recipe) => recipe.output[item])
              .map((r) => r.id),
          ]),
        ),
      };
      state.itemValues = {
        product_a: { out: rational(75, 3600) },
        product_b: { out: rational(75, 3600) },
        domain_key_tundra: {
          out: rational.zero,
          in: rational(1, 3600),
          lim: rational(1, 3600),
        },
        domain_key_jinlong: {
          out: rational.zero,
          in: rational(1, 3600),
          lim: rational(1, 3600),
        },
      };
      return state;
    }

    it('uses separate per-source capacities and integer shipments in GLPK', () => {
      const state = transferState();
      const result = service.glpk(state);
      expect(result.error).toBeFalse();
      expect(result.status).toBe('optimal');
      expect(result.cost).toEqual(rational(2));
      const transfers = Object.entries(result.recipes);
      expect(transfers.length).toBe(2);
      expect(transfers.every(([, value]) => value.isInteger())).toBeTrue();
      for (const source of ['tundra', 'jinlong']) {
        expect(
          transfers
            .filter(([id]) => id.startsWith(`transfer_${source}_`))
            .reduce((sum, [, value]) => sum.add(value), rational.zero),
        ).toEqual(rational.one);
      }

      const tundraOnly = transferState();
      tundraOnly.itemValues['domain_key_jinlong'] = {
        out: rational.zero,
        lim: rational.zero,
      };
      expect(service.glpk(tundraOnly).error).toBeTrue();
      const disabled = transferState();
      for (const key of ['domain_key_tundra', 'domain_key_jinlong'])
        disabled.itemValues[key] = { out: rational.zero, lim: rational.zero };
      expect(service.glpk(disabled).error).toBeTrue();
    });

    it('also enforces integer shipments for direct recipe objectives', () => {
      const state = transferState();
      const recipe = state.recipes['transfer_tundra_product_a'];
      state.recipes = {};
      state.recipeObjectives = [
        {
          id: 'direct-transfer',
          targetId: recipe.id,
          recipe,
          unit: ObjectiveUnit.Machines,
          type: ObjectiveType.Output,
          value: rational(1, 2),
        },
      ];
      state.itemValues['product_a'].out = rational.zero;
      state.itemValues['product_b'].out = rational.zero;
      expect(service.glpk(state).error).toBeTrue();
    });

    it('solves shipments using actual recipes from both game-data sources', () => {
      const state = getState();
      const recipeIds = [
        'transfer_tundra_equip_script_1',
        'transfer_tundra_equip_script_2',
        'transfer_jinlong_copper_ore',
      ];
      const recipes: Entities<AdjustedRecipe> = {};
      for (const id of recipeIds) {
        const raw = aefData.recipes.find((recipe) => recipe.id === id);
        expect(raw).toBeDefined();
        const recipe: AdjustedRecipe = {
          ...Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperOre],
          ...parseRecipe(raw as unknown as RecipeJson),
          produces: new Set(),
          output: {},
          cost: rational.one,
        };
        finalizeRecipe(recipe);
        recipes[id] = recipe;
      }
      const itemIds = [
        'domain_key_tundra',
        'domain_key_jinlong',
        'equip_script_1',
        'equip_script_2',
        'copper_ore',
      ];
      state.recipes = recipes;
      state.data = {
        ...Mocks.adjustedDataset,
        modId: 'aef',
        itemAvailableIoRecipeIds: Object.fromEntries(
          itemIds.map((id) => [
            id,
            Object.values(recipes)
              .filter((recipe) => recipe.output[id])
              .map((recipe) => recipe.id),
          ]),
        ),
      };
      state.itemValues = {
        domain_key_tundra: {
          out: rational.zero,
          in: rational(1, 3600),
          lim: rational(1, 3600),
        },
        domain_key_jinlong: {
          out: rational.zero,
          in: rational(1, 3600),
          lim: rational(1, 3600),
        },
        equip_script_1: { out: rational(75, 3600) },
        equip_script_2: { out: rational.zero },
        copper_ore: { out: rational(750, 3600) },
      };
      expect(recipes['transfer_jinlong_copper_ore'].time).toEqual(
        rational(3600),
      );
      expect(
        recipes['transfer_jinlong_copper_ore'].in['domain_key_jinlong'],
      ).toEqual(rational.one);
      expect(recipes['transfer_jinlong_copper_ore'].out['copper_ore']).toEqual(
        rational(1500),
      );
      const result = service.glpk(state);
      expect(result.status).toBe('optimal');
      expect(result.error).toBeFalse();
      expect(result.recipes).toEqual({
        transfer_tundra_equip_script_1: rational.one,
        transfer_jinlong_copper_ore: rational.one,
      });
      expect(result.cost).toEqual(rational(2));

      // A second half-stack from Tundra needs another whole shipment, but the
      // two Tundra recipes share the same one-shipment capacity.
      state.itemValues['equip_script_2'].out = rational(75, 7200);
      expect(service.glpk(state).error).toBeTrue();
      state.itemValues['equip_script_2'].out = rational.zero;
      state.itemValues['domain_key_jinlong'] = {
        out: rational.zero,
        lim: rational.zero,
      };
      expect(service.glpk(state).error).toBeTrue();
    });
  });

  describe('getState', () => {
    it('should build full state object', () => {
      spyOn(service, 'parseItemRecursively');
      const objectives = [
        ...Mocks.objectives,
        Mocks.objectives[3],
        Mocks.objectives[7],
      ];
      const result = service.getState(
        objectives,
        Mocks.settingsStateInitial,
        Mocks.adjustedDataset,
      );
      expect(result).toEqual({
        objectives,
        recipeObjectives: [Mocks.objectives[4], Mocks.objectives[6]] as any[],
        steps: [],
        recipes: {},
        itemValues: {
          [ItemId.AdvancedCircuit]: { out: rational.one },
          [ItemId.IronPlate]: { out: rational.zero, in: rational.one },
          [ItemId.PlasticBar]: { out: rational.zero, max: rational.one },
          [ItemId.PiercingRoundsMagazine]: { out: rational.zero },
          [ItemId.FirearmMagazine]: { out: rational.zero },
          [ItemId.SteelPlate]: { out: rational.zero },
          [ItemId.CopperPlate]: {
            out: rational.zero,
            in: rational(141n, 40n),
          },
          [ItemId.PetroleumGas]: { out: rational.zero, lim: rational(100n) },
        },
        recipeLimits: { [RecipeId.IronPlate]: rational(10n) },
        unproduceableIds: new Set([
          ItemId.AdvancedCircuit,
          ItemId.IronPlate,
          ItemId.PlasticBar,
          ItemId.PetroleumGas,
          ItemId.PiercingRoundsMagazine,
          ItemId.FirearmMagazine,
          ItemId.SteelPlate,
          ItemId.CopperPlate,
        ]),
        excludedIds: new Set(),
        itemIds: Mocks.adjustedDataset.itemIds,
        data: Mocks.adjustedDataset,
        maximizeType: MaximizeType.Ratio,
        requireMachinesOutput: false,
        costs: Mocks.costs,
        hasSurplusCost: true,
      });
    });
  });

  describe('recipeMatches', () => {
    it('should find matching recipes for an item', () => {
      const state = getState();
      const recipe = Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperOre];
      const result = service.recipeMatches(ItemId.CopperOre, state);
      expect(state.recipes).toEqual({
        [RecipeId.CopperOre]: recipe,
      });
      expect(result).toEqual([recipe]);
    });

    it('should include all input/output recipes if surplus cost > 0', () => {
      const state = getState();
      state.hasSurplusCost = true;
      const recipe = Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperOre];
      const recipe2 =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperPlate];
      const result = service.recipeMatches(ItemId.CopperOre, state);
      expect(state.recipes).toEqual({
        [RecipeId.CopperOre]: recipe,
        [RecipeId.CopperPlate]: recipe2,
      });
      expect(result).toEqual([recipe2, recipe]);
    });
  });

  describe('itemMatches', () => {
    it('should find matching items for a recipe', () => {
      const state = getState();
      const recipe = Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperCable];
      const result = service.itemMatches(recipe, state);
      expect(state.itemValues[ItemId.CopperPlate].out).toEqual(rational.zero);
      expect(state.recipes).toEqual({});
      expect(result).toEqual([ItemId.CopperPlate]);
    });

    it('should include recipe output items if surplus cost > 0', () => {
      const state = getState();
      state.hasSurplusCost = true;
      const recipe = Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperCable];
      const result = service.itemMatches(recipe, state);
      expect(state.itemValues[ItemId.CopperPlate].out).toEqual(rational.zero);
      expect(state.recipes).toEqual({});
      expect(result).toEqual([ItemId.CopperPlate, ItemId.CopperCable]);
    });
  });

  describe('parseRecipeRecursively', () => {
    it('should parse recipe inputs recursively', () => {
      spyOn(service, 'itemMatches').and.returnValue([ItemId.CopperPlate]);
      spyOn(service, 'parseItemRecursively');
      const recipe = Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperCable];
      const state = getState();
      service.parseRecipeRecursively(recipe, state);
      expect(service.itemMatches).toHaveBeenCalledWith(recipe, state);
      expect(service.parseItemRecursively).toHaveBeenCalledWith(
        ItemId.CopperPlate,
        state,
      );
    });
  });

  describe('parseItemRecursively', () => {
    it('should parse a simple recipe', () => {
      spyOn(service, 'parseRecipeRecursively');
      const state = getState();
      service.parseItemRecursively(ItemId.CopperCable, state);
      expect(service.parseRecipeRecursively).toHaveBeenCalledWith(
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperCable],
        state,
      );
    });

    it('should get complex recipe matches and parse them', () => {
      const recipe =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.AdvancedOilProcessing];
      spyOn(service, 'recipeMatches').and.returnValue([recipe]);
      spyOn(service, 'parseRecipeRecursively');
      const state = getState();
      service.parseItemRecursively(ItemId.PetroleumGas, state);
      expect(service.recipeMatches).toHaveBeenCalledWith(
        ItemId.PetroleumGas,
        state,
      );
      expect(service.parseRecipeRecursively).toHaveBeenCalledWith(
        recipe,
        state,
      );
    });
  });

  describe('addSurplusVariables', () => {
    it('should add other items that only appear as recipe outputs', () => {
      const state = getState();
      state.recipes[RecipeId.Coal] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal];
      service.addSurplusVariables(state);
      expect(state.itemValues[ItemId.Coal].out).toEqual(rational.zero);
    });
  });

  describe('parseUnproduceable', () => {
    it('should parse unproduceable items', () => {
      const state = getState();
      state.itemValues[ItemId.Wood] = { out: rational.one };
      state.itemValues[ItemId.Coal] = { out: rational.one };
      state.recipes = {
        [RecipeId.Coal]: Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal],
      };
      service.parseUnproduceable(state);
      expect(state.unproduceableIds).toEqual(new Set([ItemId.Wood]));
    });
  });

  describe('getSolution', () => {
    it('should parse the solution found by simplex', () => {
      spyOn(service, 'glpk').and.returnValue({} as any);
      const state = getState();
      const result = service.getSolution(state);
      expect(result.resultType).toEqual(SimplexResultType.Solved);
    });

    it('should handle glpk failure', () => {
      spyOn(service, 'glpk').and.returnValue({ error: true } as any);
      const state = getState();
      const result = service.getSolution(state);
      expect(result.resultType).toEqual(SimplexResultType.Failed);
    });
  });

  describe('itemCost', () => {
    it('should adjust cost of fluids', () => {
      const state = getState();
      const result = service.itemCost(
        ItemId.PetroleumGas,
        'unproduceable',
        state,
      );
      expect(result).toEqual(
        state.costs.unproduceable.div(rational(10n)).toNumber(),
      );
    });
  });

  describe('glpk', () => {
    it('should find a solution using glpk', () => {
      const state = getState();
      // Coal = excluded input, Wood = normal input
      state.itemIds = state.itemIds.filter((i) => i !== ItemId.Coal);
      state.unproduceableIds = new Set([
        ItemId.Wood,
        ItemId.Coal,
        ItemId.IronOre,
      ]);
      state.excludedIds = new Set([ItemId.CopperOre]);
      state.recipes[RecipeId.CopperPlate] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperPlate];
      state.recipes[RecipeId.CopperPlate].cost = undefined;
      state.recipes[RecipeId.IronPlate] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.IronPlate];
      state.itemValues[ItemId.Wood] = {
        out: rational.one,
      };
      state.itemValues[ItemId.Coal] = { out: rational.one };
      state.itemValues[ItemId.IronPlate] = {
        out: rational.zero,
        max: rational.one,
      };
      state.itemValues[ItemId.IronOre] = {
        out: rational.zero,
        in: rational.one,
        lim: rational(10n),
      };
      state.itemValues[ItemId.CopperCable] = { out: rational.zero };
      state.itemValues[ItemId.CopperPlate] = { out: rational.zero };
      state.itemValues[ItemId.CopperOre] = { out: rational.zero };
      state.recipeLimits[RecipeId.CopperPlate] = rational(10n);
      state.recipeObjectives = [
        {
          id: '0',
          targetId: RecipeId.IronPlate,
          value: rational.one,
          unit: ObjectiveUnit.Machines,
          type: ObjectiveType.Output,
          recipe: Mocks.adjustedDataset.adjustedRecipe[RecipeId.IronPlate],
        },
        {
          id: '1',
          targetId: RecipeId.CopperCable,
          value: rational.one,
          unit: ObjectiveUnit.Machines,
          type: ObjectiveType.Maximize,
          recipe: Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperCable],
        },
      ];
      const result = service.glpk(state);
      expect(result.returnCode).toEqual('ok');
      expect(result.status).toEqual('optimal');
    });

    it('should find a solution using glpk maximizing by ratio', () => {
      const state = getState();
      state.maximizeType = MaximizeType.Ratio;
      state.requireMachinesOutput = false;
      // Coal = excluded input, Wood = normal input
      state.itemIds = state.itemIds.filter((i) => i !== ItemId.Coal);
      state.unproduceableIds = new Set([
        ItemId.Wood,
        ItemId.Coal,
        ItemId.IronOre,
      ]);
      state.excludedIds = new Set([ItemId.CopperOre]);
      state.recipes[RecipeId.CopperPlate] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperPlate];
      state.recipes[RecipeId.IronPlate] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.IronPlate];
      state.itemValues[ItemId.Wood] = {
        out: rational.one,
      };
      state.itemValues[ItemId.Coal] = { out: rational.one };
      state.itemValues[ItemId.IronPlate] = {
        out: rational.zero,
        max: rational.one,
      };
      state.itemValues[ItemId.IronOre] = {
        out: rational.zero,
        in: rational.one,
        lim: rational(10n),
      };
      state.itemValues[ItemId.CopperCable] = { out: rational.zero };
      state.itemValues[ItemId.CopperPlate] = { out: rational.zero };
      state.itemValues[ItemId.CopperOre] = { out: rational.zero };
      state.recipeLimits[RecipeId.CopperPlate] = rational(10n);
      state.recipeObjectives = [
        {
          id: '0',
          targetId: RecipeId.IronPlate,
          value: rational.one,
          unit: ObjectiveUnit.Machines,
          type: ObjectiveType.Output,
          recipe: Mocks.adjustedDataset.adjustedRecipe[RecipeId.IronPlate],
        },
        {
          id: '1',
          targetId: RecipeId.CopperCable,
          value: rational.one,
          unit: ObjectiveUnit.Machines,
          type: ObjectiveType.Maximize,
          recipe: Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperCable],
        },
      ];
      const result = service.glpk(state);
      expect(result.returnCode).toEqual('ok');
      expect(result.status).toEqual('optimal');
    });

    it('should handle glpk failure', () => {
      spyOn(service, 'glpkSimplex').and.returnValue(['failure', 'infeasible']);
      const state = getState();
      const result = service.glpk(state);
      expect(result.returnCode).toEqual('failure');
    });
  });

  describe('updateSteps', () => {
    it('should walk through and update steps based on simplex result', () => {
      spyOn(service, 'addItemStep');
      spyOn(service, 'assignRecipes');
      spyOn(service, 'addRecipeStep');
      const state = getState();
      state.itemValues[ItemId.Coal] = { out: rational.zero };
      state.itemValues[ItemId.IronOre] = { out: rational.zero };
      state.recipes[RecipeId.Coal] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal];
      state.recipes[ItemId.Wood] = { id: null } as any;
      state.recipes[RecipeId.IronOre] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.IronOre];
      state.recipeObjectives = [Mocks.objectives[4] as any];
      const solution: any = {
        surplus: { [ItemId.IronOre]: rational.one },
        inputs: { [ItemId.Wood]: rational.one },
        recipes: { [RecipeId.IronOre]: rational(2n) },
      };
      state.steps = [
        { id: '0' },
        { id: '1', output: rational.one },
        { id: '2' },
        { id: '3', output: rational.one },
      ];
      service.updateSteps(solution, state);
      expect(service.addItemStep).toHaveBeenCalledTimes(2);
      expect(service.assignRecipes).toHaveBeenCalledTimes(1);
      expect(service.addRecipeStep).toHaveBeenCalledTimes(2);
    });
  });

  describe('addItemStep', () => {
    it('should add a new step', () => {
      const solution: any = {
        surplus: {},
        unproduceable: {},
        excluded: {},
        recipes: {
          [RecipeId.Coal]: rational(2n),
          [RecipeId.PlasticBar]: rational.one,
        },
      };
      const state = getState();
      state.itemValues[ItemId.Coal] = { out: rational(3n) };
      state.recipes[RecipeId.Coal] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal];
      state.recipes[RecipeId.PlasticBar] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.PlasticBar];
      state.recipeObjectives = [Mocks.objectives[4] as any];
      service.addItemStep(ItemId.Coal, solution, state);
      expect(state.steps).toEqual([
        {
          id: '0',
          itemId: ItemId.Coal,
          items: rational(1183n, 200n),
          output: rational(3n),
          parents: { '': rational(3n) },
        },
      ]);
    });

    it('should include recipe objective output a new step', () => {
      const solution: any = {
        surplus: {},
        unproduceable: { [ItemId.PiercingRoundsMagazine]: rational.one },
        excluded: { [ItemId.PiercingRoundsMagazine]: rational.one },
        recipes: {},
      };
      const state = getState();
      state.itemValues[ItemId.PiercingRoundsMagazine] = { out: rational.zero };
      state.recipeObjectives = [Mocks.objectives[4] as any];
      service.addItemStep(ItemId.PiercingRoundsMagazine, solution, state);
      expect(state.steps).toEqual([
        {
          id: '0',
          itemId: ItemId.PiercingRoundsMagazine,
          items: rational(59n, 12n),
        },
      ]);
    });

    it('should assign a surplus value', () => {
      const solution: any = {
        surplus: { [ItemId.Coal]: rational(3n) },
        unproduceable: {},
        excluded: {},
        recipes: { [RecipeId.Coal]: rational(4n) },
      };
      const state = getState();
      state.itemValues[ItemId.Coal] = { out: rational.zero };
      state.recipes[RecipeId.Coal] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal];
      service.addItemStep(ItemId.Coal, solution, state);
      expect(state.steps).toEqual([
        {
          id: '0',
          itemId: ItemId.Coal,
          items: rational(1183n, 100n),
          surplus: rational(3n),
        },
      ]);
    });

    it('should avoid floating point errors in surpluses', () => {
      const solution: any = {
        surplus: {
          [ItemId.Coal]: rational(1183000000001n, 100000000000n),
        },
        unproduceable: {},
        excluded: {},
        recipes: { [RecipeId.Coal]: rational(4n) },
      };
      const state = getState();
      state.itemValues[ItemId.Coal] = { out: rational.zero };
      state.recipes[RecipeId.Coal] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal];
      service.addItemStep(ItemId.Coal, solution, state);
      expect(state.steps).toEqual([
        {
          id: '0',
          itemId: ItemId.Coal,
          items: rational(1183n, 100n),
          surplus: rational(1183n, 100n),
        },
      ]);
    });

    it('should include input values', () => {
      const solution: any = {
        surplus: {},
        unproduceable: {},
        excluded: {},
        recipes: {},
      };
      const state = getState();
      state.itemValues[ItemId.Coal] = { out: rational.zero, in: rational.one };
      service.addItemStep(ItemId.Coal, solution, state);
      expect(state.steps).toEqual([
        {
          id: '0',
          itemId: ItemId.Coal,
          items: rational.one,
        },
      ]);
    });
  });

  describe('assignRecipes', () => {
    it('should assign recipes to appropriate steps', () => {
      const solution: any = {
        surplus: {},
        unproduceable: {},
        excluded: {},
        recipes: {
          [RecipeId.CopperCable]: rational.one,
          [RecipeId.AdvancedOilProcessing]: rational.one,
          [RecipeId.BasicOilProcessing]: rational.one,
        },
      };
      const state = getState();
      state.steps = [
        {
          id: '0',
          itemId: ItemId.CopperCable,
          items: rational.zero,
        },
        {
          id: '1',
          itemId: ItemId.HeavyOil,
          items: rational.zero,
        },
        {
          id: '2',
          itemId: ItemId.PetroleumGas,
          items: rational.zero,
        },
        {
          id: '3',
          itemId: ItemId.LightOil,
          items: rational.zero,
        },
      ];
      state.recipes[RecipeId.CopperCable] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.CopperCable];
      state.recipes[RecipeId.AdvancedOilProcessing] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.AdvancedOilProcessing];
      state.recipes[RecipeId.BasicOilProcessing] =
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.BasicOilProcessing];
      state.recipeObjectives = [Mocks.objectives[4] as any];
      service.assignRecipes(solution, state);
      expect(state.steps).toEqual([
        {
          id: '0',
          itemId: ItemId.CopperCable,
          recipeId: RecipeId.CopperCable,
          items: rational.zero,
        },
        {
          id: '1',
          itemId: ItemId.HeavyOil,
          recipeId: RecipeId.AdvancedOilProcessing,
          items: rational.zero,
        },
        {
          id: '2',
          itemId: ItemId.PetroleumGas,
          recipeId: RecipeId.BasicOilProcessing,
          items: rational.zero,
        },
        {
          id: '3',
          itemId: ItemId.LightOil,
          items: rational.zero,
        },
      ]);
    });
  });

  describe('addRecipeStep', () => {
    it('should update an existing step', () => {
      spyOn(service.rateSvc, 'adjustPowerPollution');
      const state = getState();
      state.steps = [
        {
          id: 'id',
          itemId: ItemId.Coal,
          items: rational.one,
        },
      ];
      const solution: any = {
        surplus: {},
        inputs: {},
        recipes: { [RecipeId.Coal]: rational.one },
      };
      service.addRecipeStep(
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal],
        solution,
        state,
      );
      expect(service.rateSvc.adjustPowerPollution).toHaveBeenCalled();
      expect(state.steps).toEqual([
        {
          id: 'id',
          itemId: ItemId.Coal,
          recipeId: RecipeId.Coal,
          items: rational.one,
          machines: rational.one,
          recipe: Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal],
        },
      ]);
    });

    it('should add a new step', () => {
      spyOn(service.rateSvc, 'adjustPowerPollution');
      const state = getState();
      const solution: any = {
        surplus: {},
        inputs: {},
        recipes: { [RecipeId.Coal]: rational.one },
      };
      service.addRecipeStep(
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal],
        solution,
        state,
      );
      expect(service.rateSvc.adjustPowerPollution).toHaveBeenCalled();
      expect(state.steps).toEqual([
        {
          id: '0',
          recipeId: RecipeId.Coal,
          machines: rational.one,
          recipe: Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal],
        },
      ]);
    });

    it('should add a recipe objective step', () => {
      spyOn(service.rateSvc, 'adjustPowerPollution');
      const state = getState();
      const solution: any = {
        surplus: {},
        inputs: {},
        recipes: { [RecipeId.Coal]: rational.one },
      };
      service.addRecipeStep(
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal],
        solution,
        state,
        Mocks.objectives[4] as any,
      );
      expect(service.rateSvc.adjustPowerPollution).toHaveBeenCalled();
      expect(state.steps).toEqual([
        {
          id: '0',
          recipeId: RecipeId.Coal,
          machines: rational.one,
          recipe: Mocks.adjustedDataset.adjustedRecipe[RecipeId.Coal],
          recipeObjectiveId: Mocks.objectives[4].id,
        },
      ]);
    });

    it('should place a new step next to related steps', () => {
      spyOn(service.rateSvc, 'adjustPowerPollution');
      const state = getState();
      state.steps = [
        {
          id: '0',
          itemId: ItemId.PetroleumGas,
          recipeId: RecipeId.BasicOilProcessing,
          items: rational.zero,
        },
        {
          id: '1',
          itemId: ItemId.Wood,
          items: rational.zero,
        },
      ];
      const solution: any = {
        surplus: {},
        inputs: {},
        recipes: { [RecipeId.AdvancedOilProcessing]: rational.one },
      };
      service.addRecipeStep(
        Mocks.adjustedDataset.adjustedRecipe[RecipeId.AdvancedOilProcessing],
        solution,
        state,
      );
      expect(service.rateSvc.adjustPowerPollution).toHaveBeenCalled();
      expect(state.steps).toEqual([
        {
          id: '0',
          itemId: ItemId.PetroleumGas,
          recipeId: RecipeId.BasicOilProcessing,
          items: rational.zero,
        },
        {
          id: '2',
          recipeId: RecipeId.AdvancedOilProcessing,
          machines: rational.one,
          recipe:
            Mocks.adjustedDataset.adjustedRecipe[
              RecipeId.AdvancedOilProcessing
            ],
        },
        { id: '1', itemId: ItemId.Wood, items: rational.zero },
      ]);
    });
  });
});
