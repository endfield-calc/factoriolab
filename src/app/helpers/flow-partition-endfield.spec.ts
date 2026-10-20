import { TestBed } from '@angular/core/testing';
import endfieldJson from 'src/data/aef/data.json';
import hashJson from 'src/data/aef/hash.json';

import { ModData } from '~/models/data/mod-data';
import { ModHash } from '~/models/data/mod-hash';
import { SimplexResultType } from '~/models/enum/simplex-result-type';
import { LabParams } from '~/models/lab-params';
import { rational } from '~/models/rational';
import { FlowService } from '~/services/flow.service';
import { RouterService } from '~/services/router.service';
import { DatasetsService } from '~/store/datasets.service';
import { Mocks, TestModule } from '~/tests';

import { partitionFlow, rawFlow } from './flow-partition';

const hash: ModHash = {
  beacons: [],
  fuels: [],
  wagons: [],
  modules: [],
  technologies: [],
  ...hashJson,
};

describe('Endfield base partition regression', () => {
  it('keeps the shared xiranite plan free of unrelated copper chains and storage at local loops or extraction', async () => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    TestBed.inject(DatasetsService).loadData(
      'aef',
      endfieldJson as unknown as ModData,
      hash,
    );
    const router = TestBed.inject(RouterService);
    spyOn(router.customRecipeSvc, 'recipesForMod').and.returnValue([]);
    spyOn(router.customRecipeSvc, 'generatedItemsForMod').and.returnValue([]);
    const z =
      'eJxNjMsOgjAQRb-mXUxiYqciqy54uADC2sSNqbYqUSgpBfl8A8hjM7k55841IpQAgNSIC-yBA2NjRH.IA3YrPm.jcS5E-YqjHJDNIs5WEWfgLTzd8BSQzyJ8AkMAxoelBADYgT5qJ4gfEsSbbHRDEAkPiBdOrFB.MGnCg7LtbKf4a1eVb9kUg8aIIFay1Eu3tws3ratblzhdJmqzjtgXVlaF09fafJUeH7yY-PF0qdW9OKX0Y-4ioJ1g7AcEjlQX';
    const params = (await router.unzipQueryParams({ z, v: '11' })) as LabParams;
    const modules = router.unzipModules(params, hash);
    const beacons = router.unzipBeacons(params, modules, hash);
    const objectivesState = router.unzipObjectives(
      params,
      modules,
      beacons,
      hash,
    );
    router.dispatch({
      objectivesState,
      itemsState: router.unzipItems(params, hash),
      recipesState: router.unzipRecipes(params, modules, beacons, hash),
      machinesState: router.unzipMachines(params, modules, beacons, hash),
      settingsState: router.unzipSettings(
        'aef',
        params,
        beacons,
        Object.keys(objectivesState ?? {}),
        endfieldJson as unknown as ModData,
        hash,
        hash,
      ),
    });
    expect(router.objectivesSvc.matrixResult().resultType).toBe(
      SimplexResultType.Solved,
    );
    const svc = TestBed.inject(FlowService);
    const flow = svc.buildGraph(
      router.objectivesSvc.steps(),
      '/m',
      router.settingsSvc.settings(),
      svc.preferencesSvc.state(),
      svc.recipesSvc.adjustedDataset(),
      Mocks.themeValues,
    );
    const sections = partitionFlow(
      flow,
      router.settingsSvc.state().flowPartition!.bases,
      { input: '取用', output: '入库' },
    );
    const xiranite = sections[1];
    expect(xiranite.recipeNodeIds.slice().sort()).toEqual([
      'r|carbon_mtl-plant_grass_2',
      'r|plant_grass_2',
      'r|plant_grass_seed_2',
      'r|xiranite_powder-carbon_mtl',
    ]);
    expect(
      sections
        .flatMap((section) => section.flow.nodes)
        .some(
          (node) =>
            node.warehouse &&
            ['liquid_water', 'liquid_acid'].includes(node.warehouse.itemId),
        ),
    ).toBeFalse();
    expect(
      xiranite.flow.nodes.some(
        (node) =>
          node.warehouse &&
          ((node.warehouse.itemId === 'plant_grass_2' &&
            node.warehouse.direction === 'input') ||
            node.warehouse.itemId === 'plant_grass_seed_2'),
      ),
    ).toBeFalse();
    const local = rawFlow(xiranite.flow);
    expect(
      local.links.some(
        (link) =>
          link.source === 'i|plant_grass_2' &&
          link.target === 'r|plant_grass_seed_2',
      ),
    ).toBeTrue();
    expect(
      local.links.some(
        (link) =>
          link.source === 'i|plant_grass_seed_2' &&
          link.target === 'r|plant_grass_2',
      ),
    ).toBeTrue();
    expect(
      local.nodes.find((node) => node.id === 'i|liquid_water')?.amount,
    ).toBe('17465/32');
    const grassExport = xiranite.flow.nodes.find(
      (node) => node.warehouse?.itemId === 'plant_grass_2',
    )!.warehouse!;
    expect(grassExport.amount).toBe('185/32');
    expect(
      sections[0].flow.nodes.find(
        (node) => node.warehouse?.itemId === 'plant_grass_2',
      )?.warehouse?.amount,
    ).toBe(grassExport.amount);
    const allPorts = sections.flatMap((section) =>
      section.flow.nodes.flatMap((node) =>
        node.warehouse ? [node.warehouse] : [],
      ),
    );
    for (const itemId of new Set(allPorts.map((port) => port.itemId))) {
      const net = allPorts
        .filter((port) => port.itemId === itemId)
        .reduce(
          (total, port) =>
            port.direction === 'output'
              ? total.add(rational(port.amount))
              : total.sub(rational(port.amount)),
          rational.zero,
        );
      expect(net.toFraction(false))
        .withContext(`balanced cross-base flow: ${itemId}`)
        .toBe('0');
    }
    const recipes = rawFlow(flow)
      .nodes.filter(
        (node) =>
          node.recipe &&
          !(
            node.recipe.flags.has('mining') &&
            Object.keys(node.recipe.in).length === 0
          ),
      )
      .map((node) => node.id)
      .sort();
    expect(sections.flatMap((section) => section.recipeNodeIds).sort()).toEqual(
      recipes,
    );
  });
});
