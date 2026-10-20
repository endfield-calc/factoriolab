import { parseRecipe } from '~/models/data/recipe';
import { FlowData, FlowSection, Node } from '~/models/flow';
import { FlowBaseSettings } from '~/models/settings/flow-partition-settings';

import { expandFlowFocus, focusedFlow } from './flow-focus';
import {
  MAIN_BASE_ID,
  partitionFlow,
  rawFlow,
  sectionFocus,
  warehouseTotals,
} from './flow-partition';

describe('base flow partition', () => {
  const labels = {
    input: 'From warehouse',
    output: 'To warehouse',
    main: 'Main',
    base: 'Base',
  };
  const base = (id: string, ...outputItemIds: string[]): FlowBaseSettings => ({
    id: `base:${id}`,
    name: id,
    outputItemIds,
  });
  function graph(edges: [string, string, string][]): FlowData {
    return {
      modId: 'aef',
      rateSuffix: '/m',
      nodes: [
        ...new Set(edges.flatMap(([source, target]) => [source, target])),
      ].map(
        (id): Node => ({
          id,
          stepId: id,
          name: id.slice(2),
          text: 'rate',
          color: 'black',
          posX: '0',
          posY: '0',
          viewBox: '0 0 64 64',
          href: '',
        }),
      ),
      links: edges.map(([source, target, amount], index) => ({
        id: `edge-${String(index)}`,
        source,
        target,
        amount,
        name: 'material',
        text: '',
        color: 'black',
        value: 0.1,
      })),
    };
  }
  function supplyFlow(): FlowData {
    return graph([
      ['i|ore', 'r|supply', '10'],
      ['r|supply', 'i|core', '10'],
      ['i|core', 'r|battery', '6'],
      ['r|battery', 'i|battery', '3'],
      ['i|battery', 'o|battery', '3'],
      ['i|core', 'r|copper', '4'],
      ['r|copper', 'i|copper', '2'],
      ['i|copper', 'o|copper', '2'],
    ]);
  }
  function checkOwnership(flow: FlowData, sections: FlowSection[]): void {
    const recipes = rawFlow(flow)
      .nodes.filter(
        (node) =>
          (node.id.startsWith('r|') || node.id.startsWith('m|')) &&
          !(
            node.recipe?.flags.has('mining') &&
            !Object.keys(node.recipe.in).length
          ),
      )
      .map((node) => node.id)
      .sort();
    expect(sections.flatMap((section) => section.recipeNodeIds).sort()).toEqual(
      recipes,
    );
    const extractionIds = new Set(
      rawFlow(flow)
        .nodes.filter(
          (node) =>
            node.recipe?.flags.has('mining') &&
            !Object.keys(node.recipe.in).length,
        )
        .map((node) => node.id),
    );
    const originalLinks = rawFlow(flow).links.filter(
      (link) => !extractionIds.has(link.source),
    );
    const assignedLinks = sections.flatMap((section) =>
      rawFlow(section.flow).links.filter(
        (link) => !link.id?.startsWith('transfer|'),
      ),
    );
    expect(assignedLinks.map((link) => link.id).sort()).toEqual(
      originalLinks.map((link) => link.id).sort(),
    );
    for (const link of originalLinks)
      expect(
        assignedLinks.find((assigned) => assigned.id === link.id)?.amount,
      ).toBe(link.amount);
    for (const section of sections) {
      const ids = new Set(section.flow.nodes.map((node) => node.id));
      expect(
        section.flow.links.every(
          (link) => ids.has(link.source) && ids.has(link.target),
        ),
      ).toBeTrue();
    }
  }
  function ports(section: FlowSection): Record<string, string> {
    return Object.fromEntries(
      section.flow.nodes.flatMap((node) =>
        node.warehouse
          ? [
              [
                `${node.warehouse.direction}:${node.warehouse.itemId}`,
                node.warehouse.amount,
              ],
            ]
          : [],
      ),
    );
  }

  it('moves only upstream production into a sub-base and keeps downstream recipes in the main base', () => {
    const flow = supplyFlow();
    const original = JSON.stringify(flow);
    const [main, supply] = partitionFlow(
      flow,
      [base('supply', 'core')],
      labels,
    );
    expect(main.id).toBe(MAIN_BASE_ID);
    expect(main.recipeNodeIds).toEqual(['r|battery', 'r|copper']);
    expect(supply.recipeNodeIds).toEqual(['r|supply']);
    expect(ports(main)['input:core']).toBe('10');
    expect(ports(supply)['output:core']).toBe('10');
    checkOwnership(flow, [main, supply]);
    expect(JSON.stringify(flow)).toBe(original);
  });

  it('supports supply between sub-bases regardless of which one was created first', () => {
    for (const definitions of [
      [base('battery', 'battery'), base('supply', 'core')],
      [base('supply', 'core'), base('battery', 'battery')],
    ]) {
      const sections = partitionFlow(supplyFlow(), definitions, labels);
      const battery = sections.find(
        (section) => section.id === 'base:battery',
      )!;
      expect(battery.recipeNodeIds).toEqual(['r|battery']);
      expect(ports(battery)).toEqual({
        'input:core': '6',
        'output:battery': '3',
      });
      expect(sections[0].recipeNodeIds).toEqual(['r|copper']);
      checkOwnership(supplyFlow(), sections);
    }
  });

  it('does not merge bases through shared water or a common final delivery', () => {
    const flow = graph([
      ['i|water', 'r|supply', '2'],
      ['r|supply', 'i|core', '10'],
      ['i|water', 'r|use', '3'],
      ['i|core', 'r|use', '10'],
      ['r|use', 'i|coupon', '5'],
      ['r|supply', 'i|coupon', '1'],
      ['i|coupon', 'o|coupon', '6'],
    ]);
    const sections = partitionFlow(flow, [base('supply', 'core')], labels);
    expect(sections[0].recipeNodeIds).toEqual(['r|use']);
    expect(sections[1].recipeNodeIds).toEqual(['r|supply']);
    expect(ports(sections[1])['output:coupon']).toBe('1');
    expect(
      sections[0].flow.nodes.find((node) => node.id === 'i|water')?.amount,
    ).toBe('3');
    expect(
      sections[1].flow.nodes.find((node) => node.id === 'i|water')?.amount,
    ).toBe('2');
    checkOwnership(flow, sections);
  });

  it('assigns co-production equipment once and supplies its other output through storage', () => {
    const flow = graph([
      ['i|ore', 'r|mix', '2'],
      ['r|mix', 'i|a', '3'],
      ['r|mix', 'i|b', '4'],
      ['i|a', 'r|use-a', '3'],
      ['i|b', 'r|use-b', '4'],
    ]);
    const sections = partitionFlow(
      flow,
      [base('a', 'a'), base('b', 'b')],
      labels,
    );
    expect(sections[1].recipeNodeIds).toEqual(['r|mix']);
    expect(sections[2].recipeNodeIds).toEqual([]);
    expect(sections[2].sharedOutputs).toEqual([
      { itemId: 'b', baseId: 'base:a' },
    ]);
    expect(ports(sections[1])['output:b']).toBe('4');
    expect(ports(sections[0])['input:b']).toBe('4');
    checkOwnership(flow, sections);
  });

  it('keeps shared upstream equipment in the earliest base and transfers its output to the other', () => {
    const flow = graph([
      ['i|ore', 'r|refine', '3'],
      ['r|refine', 'i|metal', '3'],
      ['i|metal', 'r|a', '1'],
      ['r|a', 'i|a', '1'],
      ['i|metal', 'r|b', '2'],
      ['r|b', 'i|b', '2'],
    ]);
    const sections = partitionFlow(
      flow,
      [base('a', 'a'), base('b', 'b')],
      labels,
    );
    expect(sections[1].recipeNodeIds).toEqual(['r|refine', 'r|a']);
    expect(sections[2].recipeNodeIds).toEqual(['r|b']);
    expect(ports(sections[2])['input:metal']).toBe('2');
    checkOwnership(flow, sections);
  });

  it('supports multiple final outputs in one base without duplicating chained recipes', () => {
    const flow = supplyFlow();
    const sections = partitionFlow(
      flow,
      [base('both', 'core', 'battery')],
      labels,
    );
    expect(sections[1].recipeNodeIds).toEqual(['r|supply', 'r|battery']);
    expect(sections[0].recipeNodeIds).toEqual(['r|copper']);
    expect(ports(sections[1])['output:core']).toBe('4');
    expect(ports(sections[1])['input:core']).toBeUndefined();
    expect(
      sections[1].flow.links.some(
        (link) =>
          link.source === 'r|supply' &&
          link.target === 'r|battery' &&
          link.amount === '6',
      ),
    ).toBeTrue();
    expect(ports(sections[0])['input:core']).toBe('4');
    checkOwnership(flow, sections);
  });

  it('keeps cyclic dependencies between bases finite and preserves both storage directions', () => {
    const flow = graph([
      ['i|b', 'r|a', '1'],
      ['r|a', 'i|a', '2'],
      ['i|a', 'r|b', '1'],
      ['r|b', 'i|b', '1'],
      ['i|a', 'o|a', '1'],
    ]);
    const sections = partitionFlow(
      flow,
      [base('a', 'a'), base('b', 'b')],
      labels,
    );
    expect(sections[1].recipeNodeIds).toEqual(['r|a']);
    expect(sections[2].recipeNodeIds).toEqual(['r|b']);
    expect(ports(sections[1])).toEqual({ 'output:a': '2', 'input:b': '1' });
    expect(ports(sections[2])).toEqual({ 'input:a': '1', 'output:b': '1' });
    checkOwnership(flow, sections);
  });

  it('keeps a recycling loop connected and imports only its unmet demand with exact precision', () => {
    const flow = graph([
      ['i|core', 'r|process', '5/3'],
      ['r|process', 'i|waste', '1'],
      ['i|waste', 'r|recover', '1'],
      ['r|recover', 'i|core', '1/3'],
    ]);
    const sections = partitionFlow(flow, [base('loop', 'core')], labels, 3);
    expect(ports(sections[1])['input:core']).toBe('4/3');
    expect(ports(sections[1])['output:core']).toBeUndefined();
    expect(
      rawFlow(sections[1].flow).links.some(
        (link) =>
          link.source === 'r|recover' &&
          link.target === 'i|core' &&
          link.amount === '1/3',
      ),
    ).toBeTrue();
    expect(
      rawFlow(sections[1].flow).links.some(
        (link) =>
          link.source === 'i|core' &&
          link.target === 'r|process' &&
          link.amount === '5/3',
      ),
    ).toBeTrue();
    expect(
      sections[1].flow.nodes.find(
        (node) => node.warehouse?.direction === 'input',
      )?.text,
    ).toContain('1.334/m');
    checkOwnership(flow, sections);
  });

  it('does not trace unrelated byproduct suppliers, but allows an explicitly selected byproduct', () => {
    const flow = graph([
      ['i|ore', 'r|recover', '1'],
      ['r|recover', 'i|metal', '1'],
      ['r|recover', 'i|water', '2'],
      ['i|water', 'r|supply', '2'],
      ['r|supply', 'i|core', '3'],
    ]);
    flow.links[2].byproduct = true;
    const sections = partitionFlow(flow, [base('supply', 'core')], labels);
    expect(sections[1].recipeNodeIds).toEqual(['r|supply']);
    expect(sections[0].recipeNodeIds).toEqual(['r|recover']);
    expect(ports(sections[1])['input:water']).toBe('2');
    const selected = partitionFlow(flow, [base('water', 'water')], labels);
    expect(selected[1].recipeNodeIds).toEqual(['r|recover']);
    checkOwnership(flow, sections);
    checkOwnership(flow, selected);
  });

  it('allocates direct extraction per base without warehouse ports or duplicated extraction equipment', () => {
    const flow = graph([
      ['r|pump', 'i|water', '5'],
      ['i|water', 'r|supply', '2'],
      ['r|supply', 'i|core', '3'],
      ['i|water', 'r|use', '3'],
      ['r|use', 'i|product', '3'],
    ]);
    flow.nodes.find((node) => node.id === 'r|pump')!.recipe = parseRecipe({
      id: 'pump',
      name: 'Pump',
      category: 'raw',
      row: 0,
      time: 1,
      producers: [],
      in: {},
      out: { water: 1 },
      flags: ['mining'],
    });
    const before = JSON.stringify(flow);
    const sections = partitionFlow(flow, [base('supply', 'core')], labels);
    expect(sections[1].recipeNodeIds).toEqual(['r|supply']);
    expect(sections[0].recipeNodeIds).toEqual(['r|use']);
    expect(
      sections[1].flow.nodes.find((node) => node.id === 'i|water')?.amount,
    ).toBe('2');
    expect(
      sections[0].flow.nodes.find((node) => node.id === 'i|water')?.amount,
    ).toBe('3');
    expect(
      sections.some((section) =>
        Object.keys(ports(section)).some((key) => key.endsWith(':water')),
      ),
    ).toBeFalse();
    expect(JSON.stringify(flow)).toBe(before);
    checkOwnership(flow, sections);
  });

  it('keeps extractable materials as allocated raw supplies even when recovery meets all global demand', () => {
    const flow = graph([
      ['i|ore', 'r|recover', '1'],
      ['r|recover', 'i|metal', '1'],
      ['r|recover', 'i|acid', '2'],
      ['i|acid', 'r|supply', '2'],
      ['r|supply', 'i|core', '3'],
    ]);
    flow.extractionItemIds = ['acid'];
    const sections = partitionFlow(flow, [base('supply', 'core')], labels);
    expect(sections[1].recipeNodeIds).toEqual(['r|supply']);
    expect(
      sections[1].flow.nodes.find((node) => node.id === 'i|acid')?.amount,
    ).toBe('2');
    expect(ports(sections[0])['output:acid']).toBeUndefined();
    expect(ports(sections[1])['input:acid']).toBeUndefined();
    checkOwnership(flow, sections);
  });

  it('keeps a balanced local loop direct and exports only the amount used by another base', () => {
    const flow = graph([
      ['i|seed', 'r|grow', '3'],
      ['r|grow', 'i|grass', '6'],
      ['i|grass', 'r|seed', '3'],
      ['r|seed', 'i|seed', '3'],
      ['i|grass', 'r|supply', '2'],
      ['r|supply', 'i|core', '1'],
      ['i|grass', 'r|other', '1'],
    ]);
    const sections = partitionFlow(flow, [base('supply', 'core')], labels);
    expect(ports(sections[1])['input:grass']).toBeUndefined();
    expect(ports(sections[1])['output:grass']).toBe('1');
    expect(ports(sections[0])['input:grass']).toBe('1');
    expect(
      sections[1].flow.links.some(
        (link) =>
          link.source === 'r|grow' &&
          link.target === 'r|seed' &&
          link.amount === '3',
      ),
    ).toBeTrue();
    expect(
      sections[1].flow.links.some(
        (link) =>
          link.source === 'r|seed' &&
          link.target === 'r|grow' &&
          link.amount === '3',
      ),
    ).toBeTrue();
    const path = expandFlowFocus(flow, 'i|core', 0, false)!;
    const focused = focusedFlow(
      sections[1].flow,
      sectionFocus(sections[1], path),
    );
    expect(
      focused.links.some(
        (link) => link.id === 'transfer|base:supply|output|grass',
      ),
    ).toBeTrue();
    checkOwnership(flow, sections);

    const localOnly = graph(
      flow.links
        .filter((link) => link.target !== 'r|other')
        .map((link) => [
          link.source,
          link.target,
          link.target === 'r|supply' ? '3' : link.amount!,
        ]),
    );
    const balanced = partitionFlow(localOnly, [base('supply', 'core')], labels);
    expect(ports(balanced[1])).toEqual({ 'output:core': '1' });
    checkOwnership(localOnly, balanced);
  });

  it('keeps final delivery and surplus in the main base, even when all machines move out', () => {
    const flow = graph([
      ['i|ore', 'm|source', '10'],
      ['m|source', 'i|core', '10'],
      ['i|core', 'o|core', '7'],
      ['i|core', 's|core', '3'],
    ]);
    flow.nodes.find((node) => node.id === 'i|core')!.amount = '10';
    const sections = partitionFlow(flow, [base('source', 'core')], labels);
    expect(sections[0].recipeNodeIds).toEqual([]);
    expect(ports(sections[0])['input:core']).toBe('10');
    expect(warehouseTotals(flow, 'core')).toEqual({
      supply: '10',
      consumption: '0',
      output: '7',
      surplus: '3',
    });
    checkOwnership(flow, sections);
  });

  it('restores merged material junctions for ownership and simplifies internal nodes for display', () => {
    const raw = supplyFlow();
    const flow: FlowData = {
      ...raw,
      nodes: raw.nodes.filter((node) => node.id !== 'i|core'),
      focusGraph: {
        nodes: raw.nodes,
        links: raw.links,
        nodeAliases: {},
        paths: {},
      },
    };
    const sections = partitionFlow(flow, [base('supply', 'core')], labels);
    expect(sections[1].recipeNodeIds).toEqual(['r|supply']);
    expect(
      sections[0].flow.nodes.some((node) => node.id === 'i|battery'),
    ).toBeFalse();
    const path = expandFlowFocus(raw, 'o|battery', 0, false)!;
    expect(sectionFocus(sections[1], path).nodeIds).toContain('r|supply');
    expect(sectionFocus(sections[0], path).nodeIds).toContain('r|battery');
    expect(
      sectionFocus(sections[0], path).nodeIds.some((id) => id.startsWith('w|')),
    ).toBeTrue();
    expect(sectionFocus(sections[0], path).linkIds).not.toContain('edge-5');
    checkOwnership(flow, sections);
  });

  it('retains stable base IDs and unused definitions when the plan changes', () => {
    const flow = supplyFlow();
    const definitions = [base('supply', 'core'), base('unused', 'unused')];
    flow.nodes.reverse();
    const sections = partitionFlow(flow, definitions, labels);
    expect(sections.map((section) => section.id)).toEqual([
      'main',
      'base:supply',
      'base:unused',
    ]);
    expect(sections[2].recipeNodeIds).toEqual([]);
    checkOwnership(flow, sections);
  });

  it('restores an untraced merged ingredient without highlighting its supplier', () => {
    const flow = graph([
      ['i|ore', 'r|supply', '1'],
      ['r|supply', 'i|material', '1'],
      ['i|material', 'r|use', '1'],
      ['r|use', 'i|output', '1'],
    ]);
    const section = partitionFlow(flow, [], labels)[0];
    const path = sectionFocus(section, {
      nodeIds: ['i|material', 'r|use'],
      linkIds: ['edge-2'],
    });
    expect(path.nodeIds).not.toContain('r|supply');
    const focused = focusedFlow(section.flow, path);
    expect(focused.nodes.map((node) => node.id).sort()).toEqual([
      'i|material',
      'r|use',
    ]);
    expect(focused.links[0].source).toBe('i|material');
  });
});
