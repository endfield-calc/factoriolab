import { TestBed } from '@angular/core/testing';
import endfieldJson from 'src/data/aef/data.json';

import { spread, toEntities } from '~/helpers';
import { expandFlowFocus, focusedFlow } from '~/helpers/flow-focus';
import { MIN_LINK_VALUE } from '~/models/constants';
import {
  CustomRecipeJson,
  DEFAULT_CUSTOM_RECIPE_BACKGROUND,
} from '~/models/custom-recipe';
import { parseItem } from '~/models/data/item';
import { ModData } from '~/models/data/mod-data';
import { parseRecipe } from '~/models/data/recipe';
import { LinkValue } from '~/models/enum/link-value';
import { rational } from '~/models/rational';
import { Step } from '~/models/step';
import { ItemId, Mocks, RecipeId, TestModule } from '~/tests';

import { FlowService } from './flow.service';

describe('FlowService', () => {
  let service: FlowService;
  const fullStep: Step = {
    id: '0',
    items: rational(2n),
    belts: rational(3n),
    wagons: rational(4n),
    machines: rational(5n),
  };
  const emptyStep: Step = { id: '0' };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    service = TestBed.inject(FlowService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('recipeStepNodeType', () => {
    it('should return different prefix for recipe objective steps', () => {
      expect(service.recipeStepNodeType({} as any)).toEqual('r');
      expect(
        service.recipeStepNodeType({ recipeObjectiveId: 'obj' } as any),
      ).toEqual('m');
    });
  });

  describe('buildGraph', () => {
    function oilFlow(): ReturnType<FlowService['buildGraph']> {
      return service.buildGraph(
        Mocks.lightOilSteps,
        '/m',
        Mocks.settingsStateInitial,
        Mocks.preferencesState,
        Mocks.adjustedDataset,
        Mocks.themeValues,
      );
    }

    it('records material flow quantities independently of line width and label settings', () => {
      const flow = oilFlow();
      const alternate = service.buildGraph(
        Mocks.lightOilSteps,
        '/m',
        Mocks.settingsStateInitial,
        {
          ...Mocks.preferencesState,
          flowSettings: {
            ...Mocks.preferencesState.flowSettings,
            linkSize: LinkValue.None,
            linkText: LinkValue.Machines,
          },
        },
        Mocks.adjustedDataset,
        Mocks.themeValues,
      );
      expect(alternate.focusGraph!.links.map((link) => link.amount)).toEqual(
        flow.focusGraph!.links.map((link) => link.amount),
      );
      expect(
        flow.focusGraph!.links.every((link) => link.amount != null),
      ).toBeTrue();
      for (const step of Mocks.lightOilSteps) {
        if (!step.itemId || !step.items) continue;
        const itemId = step.itemId;
        expect(
          flow.focusGraph!.nodes!.find((node) => node.id === `i|${itemId}`)
            ?.amount,
        ).toBe(step.items.toFraction(false));
      }
    });

    function recoveryFlow(
      includeWaterPump = true,
    ): ReturnType<FlowService['buildGraph']> {
      const raw = endfieldJson as unknown as ModData;
      const recipeIds = [
        'copper_nugget',
        'copper_powder',
        'liquid_copper',
        'liquid_copper_enr',
        'phase_trans_1-gas_copper_enr',
        'gas_copper_enr2',
        'phase_trans_2-copper_enr2',
        'copper_enr2_cmpt',
        'liquid_water',
        'liquid_xiranite_poly-purifier',
        'liquid_xiranite_poly',
        'xiranite_poly',
      ];
      const recipes = raw.recipes.filter(
        (recipe) =>
          recipeIds.includes(recipe.id) &&
          (includeWaterPump || recipe.id !== 'liquid_water'),
      );
      const items = [
        ...new Set(
          recipes.flatMap((recipe) => [
            ...Object.keys(recipe.in),
            ...Object.keys(recipe.out),
          ]),
        ),
      ];
      const steps: Step[] = items.map((itemId) => ({
        id: itemId,
        itemId,
        items: rational(60n),
        ...(itemId === 'copper_enr2_cmpt' || itemId === 'xiranite_poly'
          ? { output: rational.one }
          : {}),
        parents: Object.fromEntries(
          recipes
            .filter((recipe) => recipe.in[itemId] != null)
            .map((recipe) => [`recipe-${recipe.id}`, rational.one]),
        ),
      }));
      steps.push(
        ...recipes.map(
          (recipe): Step => ({
            id: `recipe-${recipe.id}`,
            recipeId: recipe.id,
            recipeSettings: { machineId: recipe.producers[0] },
            machines: rational.one,
            outputs: Object.fromEntries(
              Object.keys(recipe.out).map((itemId) => [itemId, rational.one]),
            ),
          }),
        ),
      );
      return service.buildGraph(
        steps,
        '/m',
        Mocks.settingsStateInitial,
        Mocks.preferencesState,
        {
          ...Mocks.adjustedDataset,
          modId: 'aef',
          itemEntities: toEntities(raw.items.map(parseItem)),
          recipeEntities: toEntities(raw.recipes.map(parseRecipe)),
          iconEntities: toEntities(raw.icons),
          iconIds: raw.icons.map((icon) => icon.id),
        },
        Mocks.themeValues,
      );
    }

    it('does not promote the crystal and recovery side chains into the copper mainline', () => {
      const flow = recoveryFlow();
      const path = flow.focusPaths!['o|copper_enr2_cmpt'];
      for (const recipeId of [
        'copper_enr2_cmpt',
        'copper_nugget',
        'liquid_water',
      ]) {
        expect(path.mainNodeIds).toContain(`r|${recipeId}`);
      }
      for (const recipeId of [
        'xiranite_poly',
        'liquid_xiranite_poly',
        'liquid_xiranite_poly-purifier',
      ]) {
        expect(path.nodeIds).toContain(`r|${recipeId}`);
        expect(path.mainNodeIds).not.toContain(`r|${recipeId}`);
      }
      expect(
        flow.links.find(
          (link) =>
            link.source === 'r|liquid_xiranite_poly-purifier' &&
            link.target === 'i|liquid_water',
        )!.byproduct,
      ).toBeTrue();
      expect(
        flow.links
          .filter((link) => path.mainLinkIds!.includes(link.id!))
          .every((link) => !link.byproduct),
      ).toBeTrue();
      const crystalPath = flow.focusPaths!['o|xiranite_poly'];
      expect(crystalPath.mainNodeIds).toContain('r|xiranite_poly');
      expect(crystalPath.mainNodeIds).toContain('r|liquid_xiranite_poly');
      const wastePath = flow.focusPaths!['i|liquid_sewage'];
      expect(wastePath.mainNodeIds).toContain('r|xiranite_poly');
      expect(wastePath.mainNodeIds).toContain('r|copper_nugget');
    });

    it('records extractable materials even when their extraction is not active in the solution', () => {
      const flow = recoveryFlow(false);
      expect(flow.extractionItemIds).toContain('liquid_water');
      expect(flow.extractionItemIds).toContain('liquid_acid');
      expect(flow.extractionItemIds).not.toContain('copper_ore');
      expect(
        flow.focusGraph!.nodes!.some((node) => node.id === 'r|liquid_water'),
      ).toBeFalse();
    });

    it('keeps direct coproducts visible and highlights their output links from level 1', () => {
      const flow = recoveryFlow();
      const copperPath = flow.focusPaths!['o|copper_enr2_cmpt'];
      expect(copperPath.mainNodeIds).toContain('r|liquid_copper_enr');
      const acidTarget = flow.focusTargets!.find(
        (target) => target.id === 'i|liquid_acid',
      )!;
      expect(acidTarget.nodeId).toEqual('i|liquid_acid');
      const acidOutput = flow.links.find(
        (link) =>
          link.source === 'r|liquid_copper_enr' &&
          link.target === acidTarget.id,
      )!;
      expect(copperPath.mainLinkIds).not.toContain(acidOutput.id!);
      expect(
        expandFlowFocus(flow, 'o|copper_enr2_cmpt', 1, false)!.linkIds,
      ).toContain(acidOutput.id!);
    });

    it('keeps a recovery input visible without promoting its producer to the mainline', () => {
      const flow = recoveryFlow(false);
      const waterTarget = flow.focusTargets!.find(
        (target) => target.id === 'i|liquid_water',
      )!;
      expect(waterTarget.nodeId).toEqual('i|liquid_water');
      const path = flow.focusPaths!['o|copper_enr2_cmpt'];
      expect(path.mainNodeIds).toContain(waterTarget.nodeId);
      expect(path.mainNodeIds).not.toContain('r|liquid_xiranite_poly-purifier');
      expect(path.mainLinkIds).toContain(
        flow.links.find(
          (link) =>
            link.source === waterTarget.nodeId &&
            link.target === 'r|copper_nugget',
        )!.id!,
      );
      const waterPath = flow.focusPaths![waterTarget.id];
      expect(waterPath.mainNodeIds).toContain(waterTarget.nodeId);
      expect(waterPath.mainNodeIds).toContain(
        'r|liquid_xiranite_poly-purifier',
      );
    });

    it('expands the copper coproduct chain by processing stages and makes upstream tracing optional', () => {
      const flow = recoveryFlow();
      const targetId = 'o|copper_enr2_cmpt';
      const base = expandFlowFocus(flow, targetId, 0, false)!;
      expect(base.nodeIds).not.toContain('i|liquid_sewage');
      const direct = expandFlowFocus(flow, targetId, 1, false)!;
      expect(direct.nodeIds).toContain('i|liquid_sewage');
      expect(direct.nodeIds).not.toContain('r|liquid_xiranite_poly');
      expect(direct.nodeIds).not.toContain('r|xiranite_poly');
      const second = expandFlowFocus(flow, targetId, 2, false)!;
      expect(second.nodeIds).toContain('r|liquid_xiranite_poly');
      expect(second.nodeIds).toContain('i|liquid_xiranite_lowpoly');
      expect(second.nodeIds).not.toContain('r|xiranite_poly');
      expect(second.nodeIds).not.toContain('r|liquid_xiranite_poly-purifier');
      const third = expandFlowFocus(flow, targetId, 3, false)!;
      expect(third.nodeIds).toContain('r|xiranite_poly');
      expect(third.nodeIds).toContain('r|liquid_xiranite_poly-purifier');
      expect(expandFlowFocus(flow, targetId, 2, true)!.nodeIds).toContain(
        'r|xiranite_poly',
      );
      expect(
        flow.focusGraph!.links.every(
          (link) =>
            link.source.startsWith('i|') || link.source.startsWith('r|'),
        ),
      ).toBeTrue();
      expect(
        second.linkIds.every((id) => flow.links.some((link) => link.id === id)),
      ).toBeTrue();
    });

    it('keeps ambiguous coproduct nodes visible and selects only their upstream chain', () => {
      const result = oilFlow();
      const targetId = `i|${ItemId.HeavyOil}`;
      const target = result.focusTargets!.find((node) => node.id === targetId)!;
      expect(result.nodes.some((node) => node.id === targetId)).toBeTrue();
      expect(target.nodeId).toEqual(targetId);
      expect(target.text).toEqual(
        `${Mocks.lightOilSteps[1].items!.toString(Mocks.preferencesState.columns.items.precision)}/m`,
      );
      const before = JSON.stringify(result);
      const related = focusedFlow(
        result,
        result.focusPaths![targetId],
        targetId,
      );
      expect(related.nodes.some((node) => node.id === targetId)).toBeTrue();
      expect(
        related.nodes.some(
          (node) => node.id === `r|${RecipeId.HeavyOilCracking}`,
        ),
      ).toBeFalse();
      expect(
        related.nodes.some((node) => node.id === `o|${ItemId.LightOil}`),
      ).toBeFalse();
      expect(
        related.nodes.some((node) => node.id === `s|${ItemId.PetroleumGas}`),
      ).toBeFalse();
      expect(
        related.links.find((link) => link.target === targetId)!.source,
      ).toEqual(`r|${RecipeId.AdvancedOilProcessing}`);
      const direct = expandFlowFocus(result, targetId, 1, false)!;
      expect(direct.nodeIds).toContain(`i|${ItemId.PetroleumGas}`);
      expect(direct.nodeIds).toContain(`s|${ItemId.PetroleumGas}`);
      expect(direct.nodeIds).not.toContain(`r|${RecipeId.HeavyOilCracking}`);
      expect(JSON.stringify(result)).toEqual(before);
      expect(new Set(result.focusTargets!.map((node) => node.id)).size).toEqual(
        result.focusTargets!.length,
      );
      expect(
        result.focusTargets!.some((node) => node.id === `i|${ItemId.LightOil}`),
      ).toBeFalse();
    });

    it('restores a merged material produced without inputs as a nonempty two-node graph', () => {
      const result = oilFlow();
      const targetId = `i|${ItemId.CrudeOil}`;
      const related = focusedFlow(
        result,
        result.focusPaths![targetId],
        targetId,
      );
      expect(new Set(related.nodes.map((node) => node.id))).toEqual(
        new Set([`r|${RecipeId.CrudeOil}`, targetId]),
      );
      expect(related.links.length).toEqual(1);
      expect(related.links[0].source).toEqual(`r|${RecipeId.CrudeOil}`);
      expect(related.links[0].target).toEqual(targetId);
    });

    it('restores material edges inside a merged recycling loop without adding downstream consumers', () => {
      const result = oilFlow();
      const targetId = `i|${ItemId.Water}`;
      const related = focusedFlow(
        result,
        result.focusPaths![targetId],
        targetId,
      );
      expect(new Set(related.nodes.map((node) => node.id))).toEqual(
        new Set([`r|${RecipeId.Water}`, targetId]),
      );
      expect(related.links.length).toEqual(2);
      expect(
        related.links.some(
          (link) =>
            link.source === targetId && link.target === `r|${RecipeId.Water}`,
        ),
      ).toBeTrue();
      expect(
        related.links.some(
          (link) =>
            link.source === `r|${RecipeId.Water}` && link.target === targetId,
        ),
      ).toBeTrue();
      expect(new Set(related.links.map((link) => link.id)).size).toEqual(2);
    });

    it('maps upstream paths onto merged nodes while excluding unused coproducts', () => {
      const result = service.buildGraph(
        Mocks.lightOilSteps,
        '/m',
        Mocks.settingsStateInitial,
        Mocks.preferencesState,
        Mocks.adjustedDataset,
        Mocks.themeValues,
      );
      const path = result.focusPaths![`o|${ItemId.LightOil}`];
      const related = focusedFlow(result, path);
      expect(
        related.nodes.some(
          (node) => node.id === `r|${RecipeId.HeavyOilCracking}`,
        ),
      ).toBeTrue();
      expect(
        related.nodes.some(
          (node) => node.id === `r|${RecipeId.AdvancedOilProcessing}`,
        ),
      ).toBeTrue();
      expect(
        related.nodes.some((node) => node.id === `s|${ItemId.PetroleumGas}`),
      ).toBeFalse();
      expect(
        related.nodes.every((node) => result.nodes.includes(node)),
      ).toBeTrue();
      expect(
        path.nodeIds.every((id) => result.nodes.some((node) => node.id === id)),
      ).toBeTrue();
      expect(
        path.linkIds.every((id) => result.links.some((link) => link.id === id)),
      ).toBeTrue();
      expect(new Set(result.links.map((link) => link.id)).size).toEqual(
        result.links.length,
      );
      expect(result.modId).toEqual(Mocks.adjustedDataset.modId);
    });

    for (const iconId of ['coal', 'removed-icon', undefined]) {
      it(`uses ${iconId ?? 'text icons without an explicit background'} for custom recipe nodes`, () => {
        const step = Mocks.lightOilSteps[0];
        const customRecipe: CustomRecipeJson = {
          id: step.recipeId!,
          name: 'Custom recipe',
          category: 'material',
          row: 999,
          time: 2,
          producers: [step.recipeSettings!.machineId!],
          in: {},
          out: {},
          customRecipe: { iconId, iconText: 'AB' },
        };
        spyOn(service.customRecipeSvc, 'recipesForMod').and.returnValue([
          customRecipe,
        ]);
        const data = Mocks.getAdjustedDataset();
        const result = service.buildGraph(
          Mocks.lightOilSteps,
          '/m',
          Mocks.settingsStateInitial,
          Mocks.preferencesState,
          data,
          Mocks.themeValues,
        );
        const node = result.nodes.find(
          (entry) => entry.recipe?.id === step.recipeId,
        )!;
        expect(node).toBeDefined();
        if (iconId === 'coal') {
          const icon = data.iconEntities['coal'];
          expect(node.href).toEqual(data.iconFile);
          expect(node.color).toEqual(icon.color);
          expect(node.viewBox).toEqual(service.positionProps(icon).viewBox);
        } else {
          expect(node.href).toMatch(/^data:image\/svg\+xml/);
          expect(decodeURIComponent(node.href)).toContain('>AB</text>');
          expect(node.color).toEqual(DEFAULT_CUSTOM_RECIPE_BACKGROUND);
          expect(node.viewBox).toEqual('0 0 64 64');
        }
      });
    }

    it('should handle various link and node types', () => {
      const result = service.buildGraph(
        Mocks.lightOilSteps,
        '/m',
        Mocks.settingsStateInitial,
        Mocks.preferencesState,
        Mocks.adjustedDataset,
        Mocks.themeValues,
      );

      expect(result.nodes.length).toEqual(9);
      expect(result.links.length).toEqual(10);
    });

    it('uses self-contained composite icons in both graph renderers with an uncropped view box', () => {
      const step = Mocks.lightOilSteps[2];
      const recipe: CustomRecipeJson = {
        id: step.recipeId!,
        name: 'Composite',
        category: 'material',
        row: 999,
        time: 2,
        producers: [step.recipeSettings!.machineId!],
        in: {},
        out: {},
        customRecipe: {
          iconText: 'A',
          iconId: 'coal',
          secondaryIcon: { iconText: 'B' },
        },
      };
      spyOn(service.customRecipeSvc, 'recipesForMod').and.returnValue([recipe]);
      const composite = spyOn(service.customIconSvc, 'resolve').and.returnValue(
        'data:image/png;base64,composite',
      );
      const data = Mocks.getAdjustedDataset();
      const flow = service.buildGraph(
        Mocks.lightOilSteps,
        '/m',
        Mocks.settingsStateInitial,
        Mocks.preferencesState,
        data,
        Mocks.themeValues,
      );
      const node = flow.nodes.find(
        (entry) => entry.recipe?.id === step.recipeId,
      )!;
      expect(node.href).toEqual('data:image/png;base64,composite');
      expect(node.viewBox).toEqual('0 0 64 64');
      expect(node.posX).toEqual('0');
      expect(node.posY).toEqual('0');
      expect(node.color).toEqual(data.iconEntities['coal'].color);
      expect(composite).toHaveBeenCalledWith(recipe.customRecipe, data, false);
    });

    it('should handle different link text selection', () => {
      const result = service.buildGraph(
        Mocks.lightOilSteps,
        '/m',
        Mocks.settingsStateInitial,
        spread(Mocks.preferencesState, {
          flowSettings: spread(Mocks.flowSettings, {
            linkText: LinkValue.None,
          }),
        }),
        Mocks.adjustedDataset,
        Mocks.themeValues,
      );

      expect(result.nodes.length).toEqual(9);
      expect(result.links.length).toEqual(10);
    });

    it('should handle missing recipeId on parent', () => {
      const steps = [...Mocks.lightOilSteps];
      const broken = spread(steps[1], { parents: { '4': rational.one } });
      steps[1] = broken;
      const result = service.buildGraph(
        steps,
        '/m',
        Mocks.settingsStateInitial,
        Mocks.preferencesState,
        Mocks.adjustedDataset,
        Mocks.themeValues,
      );

      expect(result.nodes.length).toEqual(9);
      expect(result.links.length).toEqual(9);
    });
  });

  describe('stepLinkValue', () => {
    it('should handle all possible options', () => {
      expect(service.stepLinkValue(fullStep, LinkValue.None)).toEqual(
        rational.one,
      );
      expect(service.stepLinkValue(fullStep, LinkValue.Percent)).toEqual(
        rational.one,
      );
      expect(service.stepLinkValue(fullStep, LinkValue.Items)).toEqual(
        rational(2n),
      );
      expect(service.stepLinkValue(fullStep, LinkValue.Belts)).toEqual(
        rational(3n),
      );
      expect(service.stepLinkValue(fullStep, LinkValue.Wagons)).toEqual(
        rational(4n),
      );
      expect(service.stepLinkValue(fullStep, LinkValue.Machines)).toEqual(
        rational(5n),
      );
    });

    it('should handle undefined values', () => {
      expect(service.stepLinkValue(emptyStep, LinkValue.Items)).toEqual(
        rational.zero,
      );
      expect(service.stepLinkValue(emptyStep, LinkValue.Belts)).toEqual(
        rational.zero,
      );
      expect(service.stepLinkValue(emptyStep, LinkValue.Wagons)).toEqual(
        rational.zero,
      );
      expect(service.stepLinkValue(emptyStep, LinkValue.Machines)).toEqual(
        rational.zero,
      );
    });
  });

  describe('linkSize', () => {
    it('should handle all possible options', () => {
      expect(
        service.linkSize(
          rational.one,
          rational.one,
          LinkValue.None,
          rational.one,
        ),
      ).toEqual(1);
      expect(
        service.linkSize(
          rational.one,
          rational.one,
          LinkValue.Percent,
          rational.one,
        ),
      ).toEqual(1);
      expect(
        service.linkSize(
          rational.one,
          rational.one,
          LinkValue.Items,
          rational.one,
        ),
      ).toEqual(1);
    });

    it('should fall back to minimum values', () => {
      expect(
        service.linkSize(
          rational.one,
          rational.zero,
          LinkValue.Percent,
          rational.one,
        ),
      ).toEqual(MIN_LINK_VALUE);
      expect(
        service.linkSize(
          rational.one,
          rational.zero,
          LinkValue.Items,
          rational.one,
        ),
      ).toEqual(MIN_LINK_VALUE);
    });
  });

  describe('linkText', () => {
    it('should handle all possible options', () => {
      expect(
        service.linkText(
          rational.one,
          rational.one,
          LinkValue.None,
          Mocks.preferencesState.columns,
          '/m',
        ),
      ).toEqual('');
      expect(
        service.linkText(
          rational.one,
          rational.one,
          LinkValue.Percent,
          Mocks.preferencesState.columns,
          '/m',
        ),
      ).toEqual('100%');
      expect(
        service.linkText(
          rational.one,
          rational.one,
          LinkValue.Items,
          Mocks.preferencesState.columns,
          '/m',
        ),
      ).toEqual('1/m');
    });

    it('should handle null precision / remove suffix', () => {
      spyOn(service, 'linkPrecision').and.returnValue(null);
      expect(
        service.linkText(
          rational.one,
          rational.one,
          LinkValue.Machines,
          Mocks.preferencesState.columns,
          '/m',
        ),
      ).toEqual('1');
    });
  });

  describe('linkPrecision', () => {
    it('should handle all possible options', () => {
      expect(
        service.linkPrecision(LinkValue.None, Mocks.preferencesState.columns),
      ).toEqual(null);
      expect(
        service.linkPrecision(
          LinkValue.Percent,
          Mocks.preferencesState.columns,
        ),
      ).toEqual(null);
      expect(
        service.linkPrecision(LinkValue.Items, Mocks.preferencesState.columns),
      ).toEqual(1);
      expect(
        service.linkPrecision(LinkValue.Belts, Mocks.preferencesState.columns),
      ).toEqual(1);
      expect(
        service.linkPrecision(LinkValue.Wagons, Mocks.preferencesState.columns),
      ).toEqual(1);
      expect(
        service.linkPrecision(
          LinkValue.Machines,
          Mocks.preferencesState.columns,
        ),
      ).toEqual(1);
    });
  });
});
