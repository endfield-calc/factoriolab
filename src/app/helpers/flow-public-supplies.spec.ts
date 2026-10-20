import { parseRecipe } from '~/models/data/recipe';
import { FlowData, Link, Node } from '~/models/flow';
import { rational } from '~/models/rational';

import {
  buildFlowFocusPaths,
  expandFlowFocus,
  focusedFlow,
} from './flow-focus';
import { partitionFlow, sectionFocus } from './flow-partition';
import {
  localizePublicSupplies,
  publicSupplyFocus,
} from './flow-public-supplies';

describe('public supply entrances', () => {
  function node(id: string): Node {
    return {
      id,
      name: id,
      text: '10/m',
      stepId: id,
      color: 'blue',
      posX: '0',
      posY: '0',
      viewBox: '0 0 64 64',
      href: '',
    };
  }

  function graph(stages = [0, 3]): FlowData {
    const nodes = [node('i|water')];
    const links: Link[] = [];
    const edge = (source: string, target: string, amount = '1'): void => {
      links.push({
        id: `edge-${String(links.length)}`,
        source,
        target,
        amount,
        name: 'Material',
        text: `${amount}/m`,
        color: 'blue',
        value: 1,
      });
    };
    for (let i = 0; i <= Math.max(...stages); i++) {
      nodes.push(node(`r|${String(i)}`), node(`i|product${String(i)}`));
      edge(`r|${String(i)}`, `i|product${String(i)}`);
      if (i) edge(`i|product${String(i - 1)}`, `r|${String(i)}`);
    }
    for (const stage of stages) edge('i|water', `r|${String(stage)}`);
    nodes[0].amount = String(stages.length);
    return { nodes, links, rateSuffix: '/m', extractionItemIds: ['water'] };
  }

  const localize = (flow: FlowData): FlowData =>
    localizePublicSupplies(flow, true, ['water']);

  it('keeps entrances shared below three production stages', () => {
    const flow = graph([0, 2]);
    expect(localize(flow)).toBe(flow);
  });

  it('splits at three stages without counting material hops as stages', () => {
    const flow = graph([0, 3]);
    const displayed = localize(flow);
    expect(displayed.nodes.filter((n) => n.publicSupply).length).toBe(2);
    expect(displayed.links.length).toBe(flow.links.length);
    expect(displayed.links.map((l) => l.amount)).toEqual(
      flow.links.map((l) => l.amount),
    );
    expect(flow.nodes.some((n) => n.publicSupply)).toBeFalse();
    expect(flow.links.filter((l) => l.source === 'i|water').length).toBe(2);
  });

  it('groups against the first stage, avoiding transitive merging, with exact local totals', () => {
    const flow = graph([0, 2, 4]);
    const waterLinks = flow.links.filter((l) => l.source === 'i|water');
    ['1/3', '2/3', '3/7'].forEach(
      (amount, i) => (waterLinks[i].amount = amount),
    );
    const entrances = localize(flow).nodes.filter((n) => n.publicSupply);
    expect(entrances.map((n) => n.amount)).toEqual(['1', '3/7']);
    expect(entrances.map((n) => n.text)).toEqual(['1/m', '0.43/m']);
    expect(
      entrances
        .reduce((sum, n) => sum.add(rational(n.amount!)), rational.zero)
        .toFraction(false),
    ).toBe('10/7');
    expect(entrances.flatMap((n) => n.publicSupply!.linkIds).sort()).toEqual(
      waterLinks.map((l) => l.id!).sort(),
    );
  });

  it('restores the original graph when switched off or no material is selected', () => {
    const flow = graph();
    expect(localizePublicSupplies(flow, false, ['water'])).toBe(flow);
    expect(localizePublicSupplies(flow, true, [])).toBe(flow);
    expect(localizePublicSupplies(flow, true, ['other'])).toBe(flow);
  });

  it('keeps recovery and real production connected, even with public supplies selected', () => {
    const flow = graph();
    flow.links.push({
      ...flow.links[0],
      id: 'recovery',
      source: 'r|3',
      target: 'i|water',
      byproduct: true,
    });
    expect(localize(flow)).toBe(flow);
    flow.links[flow.links.length - 1].byproduct = false;
    expect(localize(flow)).toBe(flow);
  });

  it('collapses a recipe cycle when counting production stages', () => {
    const flow = graph([0, 2]);
    flow.links.push({
      ...flow.links[0],
      id: 'loop',
      source: 'i|product1',
      target: 'r|0',
    });
    expect(localize(flow)).toBe(flow);
    const long = graph([0, 4]);
    long.links.push({
      ...long.links[0],
      id: 'loop',
      source: 'i|product1',
      target: 'r|0',
    });
    expect(localize(long).nodes.filter((n) => n.publicSupply).length).toBe(2);
  });

  it('retains stage dependencies for selected materials that are actually produced', () => {
    const flow = graph([0, 3]);
    // Produced acid is part of a real loop, even if the user selects it as public.
    const deep = graph([6]);
    flow.nodes.push(
      ...deep.nodes.filter(
        (n) => !flow.nodes.some((other) => other.id === n.id),
      ),
      node('i|acid'),
    );
    flow.links.push(
      ...deep.links
        .filter(
          (l) =>
            l.target === 'r|4' ||
            l.target === 'r|5' ||
            l.target === 'r|6' ||
            ['i|product4', 'i|product5', 'i|product6'].includes(l.target),
        )
        .map((l, i) => ({ ...l, id: `deep-${String(i)}` })),
    );
    flow.links.push(
      { ...flow.links[0], id: 'acid-made', source: 'r|6', target: 'i|acid' },
      { ...flow.links[0], id: 'acid-used', source: 'i|acid', target: 'r|0' },
    );
    expect(
      localizePublicSupplies(flow, true, ['water', 'acid']).nodes.filter(
        (n) => n.publicSupply,
      ).length,
    ).toBe(0);
  });

  it('preserves one merged extraction device, its count and original dependency graph', () => {
    const raw = graph();
    const mine = {
      ...node('r|pump'),
      text: '2 Pumps',
      recipe: parseRecipe({
        id: 'pump',
        name: 'Pump',
        category: 'mining',
        row: 0,
        time: 1,
        producers: ['pump'],
        in: {},
        out: { water: 1 },
        flags: ['mining'],
      }),
    };
    raw.nodes.push(mine);
    raw.links.push({
      ...raw.links[0],
      id: 'extracted',
      source: mine.id,
      target: 'i|water',
    });
    const flow: FlowData = {
      ...raw,
      nodes: raw.nodes.filter((n) => n.id !== 'i|water'),
      links: raw.links
        .filter((l) => l.id !== 'extracted')
        .map((l) => ({
          ...l,
          source: l.source === 'i|water' ? mine.id : l.source,
        })),
      focusGraph: {
        nodes: raw.nodes,
        links: raw.links,
        nodeAliases: { 'i|water': mine.id },
        paths: buildFlowFocusPaths(raw),
      },
    };
    const displayed = localize(flow);
    expect(displayed.nodes.filter((n) => n.recipe).map((n) => n.id)).toEqual([
      mine.id,
    ]);
    expect(displayed.nodes.find((n) => n.id === mine.id)!.text).toBe(
      '1/m\n2 Pumps',
    );
    expect(displayed.focusGraph).toBe(flow.focusGraph);
    expect(displayed.links.map((l) => l.id)).toEqual(
      flow.links.map((l) => l.id),
    );
    const path = publicSupplyFocus(
      displayed,
      expandFlowFocus(flow, 'i|water', 0, false)!,
      'i|water',
    );
    const hidden = focusedFlow(displayed, path);
    expect(hidden.nodes.filter((n) => n.publicSupply).length).toBe(2);
    expect(hidden.nodes.filter((n) => n.id === 'i|water').length).toBe(0);
  });

  it('preserves warehouse entrances and extraction recipes with multiple outputs', () => {
    const flow = graph();
    flow.nodes[0].warehouse = {
      itemId: 'water',
      direction: 'input',
      amount: '2',
      linkIds: [],
    };
    expect(localize(flow)).toBe(flow);
    delete flow.nodes[0].warehouse;
    const mine = {
      ...node('r|pump'),
      recipe: parseRecipe({
        id: 'pump',
        name: 'Pump',
        category: 'mining',
        row: 0,
        time: 1,
        producers: ['pump'],
        in: {},
        out: { water: 1, other: 1 },
        flags: ['mining'],
      }),
    };
    flow.nodes.push(mine);
    flow.links.push({ ...flow.links[0], source: mine.id, target: 'i|water' });
    expect(localize(flow)).toBe(flow);
  });

  it('projects focus to the relevant entrance and keeps hidden diagrams connected', () => {
    const flow = graph();
    const displayed = localize(flow);
    const waterLink = flow.links.find(
      (l) => l.source === 'i|water' && l.target === 'r|3',
    )!;
    const path = publicSupplyFocus(displayed, {
      nodeIds: ['i|water', 'r|3'],
      linkIds: [waterLink.id!],
    });
    expect(path.nodeIds).toEqual(['r|3', 'public|water|1']);
    const hidden = focusedFlow(displayed, path);
    expect(hidden.nodes.map((n) => n.id)).toEqual(['r|3', 'public|water|1']);
    expect(hidden.links.map((l) => [l.source, l.target])).toEqual([
      ['public|water|1', 'r|3'],
    ]);
    expect(publicSupplyFocus(displayed, path, 'i|water').nodeIds).toContain(
      'i|water',
    );
  });

  it('localizes supplies after base allocation without changing any warehouse flow', () => {
    const flow = graph();
    const sections = partitionFlow(
      flow,
      [{ id: 'base:product', name: 'Product', outputItemIds: ['product3'] }],
      { input: 'Input', output: 'Output' },
    );
    const base = sections[1];
    const displayed = localize(base.flow);
    expect(displayed.nodes.filter((n) => n.publicSupply).length).toBe(2);
    expect(displayed.nodes.filter((n) => n.warehouse)).toEqual(
      base.flow.nodes.filter((n) => n.warehouse),
    );
    expect(displayed.links.map((l) => l.amount)).toEqual(
      base.flow.links.map((l) => l.amount),
    );
    const path = publicSupplyFocus(
      displayed,
      sectionFocus(base, {
        nodeIds: flow.nodes.map((n) => n.id),
        linkIds: flow.links.map((l) => l.id!),
      }),
    );
    expect(path.nodeIds).toContain('public|water|1');
  });
});
