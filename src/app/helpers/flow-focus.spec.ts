import { FlowData, Node } from '~/models/flow';

import {
  buildFlowFocusPaths,
  expandFlowFocus,
  flowFocusTargets,
  flowLinkId,
  focusedFlow,
} from './flow-focus';

describe('flow focus', () => {
  function graph(pairs: [string, string][]): FlowData {
    const ids = [...new Set(pairs.flat())];
    return {
      nodes: ids.map(
        (id): Node => ({
          id,
          stepId: id,
          name: id,
          text: '10/m',
          color: 'black',
          posX: '0',
          posY: '0',
          viewBox: '0 0 64 64',
          href: '',
        }),
      ),
      links: pairs.map(([source, target], index) => ({
        id: `edge-${String(index)}`,
        source,
        target,
        name: 'Material',
        text: '5/m',
        color: 'black',
        value: 5,
      })),
    };
  }

  function downstreamFlow(): FlowData {
    const flow = graph([
      ['i|ore', 'r|main'],
      ['r|main', 'i|product'],
      ['i|product', 'o|product'],
      ['r|main', 'i|waste'],
      ['i|waste', 's|waste'],
      ['i|waste', 'r|first'],
      ['i|extra', 'r|first'],
      ['r|supplier', 'i|extra'],
      ['i|extra-ore', 'r|supplier'],
      ['r|first', 'i|recovered'],
      ['i|recovered', 'r|second'],
      ['r|second', 'i|final'],
      ['i|final', 'r|third'],
      ['r|third', 'i|end'],
      ['i|product', 'r|unrelated'],
      ['r|supplier', 'i|supplier-coproduct'],
      ['i|supplier-coproduct', 'r|supplier-side'],
    ]);
    flow.links[3].byproduct = true;
    flow.links[15].byproduct = true;
    return flow;
  }

  it('starts at the main chain and adds only direct coproducts at level 1', () => {
    const flow = downstreamFlow();
    const base = expandFlowFocus(flow, 'o|product', 0, false)!;
    expect(new Set(base.nodeIds)).toEqual(
      new Set(['i|ore', 'r|main', 'i|product', 'o|product']),
    );
    const direct = expandFlowFocus(flow, 'o|product', 1, false)!;
    expect(new Set(direct.nodeIds)).toEqual(
      new Set([...base.nodeIds, 'i|waste', 's|waste']),
    );
    expect(new Set(direct.linkIds)).toEqual(
      new Set(['edge-0', 'edge-1', 'edge-2', 'edge-3', 'edge-4']),
    );
    expect(direct.nodeIds).not.toContain('r|first');
    expect(direct.nodeIds).not.toContain('r|unrelated');
  });

  it('counts a complete processing recipe and its outputs as one downstream level', () => {
    const flow = downstreamFlow();
    const level2 = expandFlowFocus(flow, 'o|product', 2, false)!;
    expect(level2.nodeIds).toContain('r|first');
    expect(level2.nodeIds).toContain('i|recovered');
    expect(level2.nodeIds).toContain('i|extra');
    expect(level2.nodeIds).not.toContain('r|supplier');
    expect(level2.nodeIds).not.toContain('r|second');
    expect(level2.linkIds).toContain('edge-5');
    expect(level2.linkIds).toContain('edge-6');
    expect(level2.linkIds).toContain('edge-9');
    const level3 = expandFlowFocus(flow, 'o|product', 3, false)!;
    expect(level3.nodeIds).toContain('r|second');
    expect(level3.nodeIds).toContain('i|final');
    expect(level3.nodeIds).not.toContain('r|third');
    const level4 = expandFlowFocus(flow, 'o|product', 4, false)!;
    expect(level4.nodeIds).toContain('r|third');
    expect(level4.nodeIds).toContain('i|end');
  });

  it('traces additional inputs on demand without expanding their own downstream branches', () => {
    const flow = downstreamFlow();
    const path = expandFlowFocus(flow, 'o|product', 2, true)!;
    expect(path.nodeIds).toContain('r|supplier');
    expect(path.nodeIds).toContain('i|extra-ore');
    expect(path.linkIds).toContain('edge-7');
    expect(path.linkIds).toContain('edge-8');
    expect(path.nodeIds).not.toContain('i|supplier-coproduct');
    expect(path.nodeIds).not.toContain('r|supplier-side');
    expect(path.nodeIds).not.toContain('r|second');
    expect(expandFlowFocus(flow, 'o|product', 0, true)).toEqual(
      expandFlowFocus(flow, 'o|product', 0, false),
    );
    expect(expandFlowFocus(flow, 'o|product', 1, true)).toEqual(
      expandFlowFocus(flow, 'o|product', 1, false),
    );
  });

  it('restores a merged direct ingredient when hiding without tracing its supplier', () => {
    const flow = downstreamFlow();
    const paths = buildFlowFocusPaths(flow);
    flow.focusGraph = {
      nodes: flow.nodes,
      links: flow.links.map((link) => ({ ...link })),
      nodeAliases: { 'i|extra': 'r|supplier' },
      paths,
    };
    flow.nodes = flow.nodes.filter((node) => node.id !== 'i|extra');
    flow.links = flow.links
      .filter((link) => link.target !== 'i|extra')
      .map((link) => ({
        ...link,
        source: link.source === 'i|extra' ? 'r|supplier' : link.source,
      }));
    const before = JSON.stringify(flow);
    const path = expandFlowFocus(flow, 'o|product', 2, false)!;
    expect(path.nodeIds).not.toContain('r|supplier');
    const visible = focusedFlow(flow, path, 'o|product');
    expect(visible.nodes.some((node) => node.id === 'r|supplier')).toBeFalse();
    expect(visible.nodes.some((node) => node.id === 'i|extra')).toBeTrue();
    expect(visible.links.find((link) => link.id === 'edge-6')).toEqual({
      ...flow.links.find((link) => link.id === 'edge-6')!,
      source: 'i|extra',
    });
    const traced = focusedFlow(
      flow,
      expandFlowFocus(flow, 'o|product', 2, true)!,
      'o|product',
    );
    expect(traced.nodes.some((node) => node.id === 'r|supplier')).toBeTrue();
    expect(traced.nodes.some((node) => node.id === 'i|extra-ore')).toBeTrue();
    expect(traced.links.find((link) => link.id === 'edge-6')!.source).toEqual(
      'r|supplier',
    );
    expect(JSON.stringify(flow)).toEqual(before);
  });

  it('supports recipe objectives and all direct coproduct consumers without tracing other suppliers', () => {
    const flow = graph([
      ['m|main', 'i|product'],
      ['i|product', 'o|product'],
      ['m|main', 'i|waste'],
      ['i|waste', 'r|first'],
      ['i|waste', 'r|second'],
      ['r|first', 'i|a'],
      ['r|second', 'i|b'],
      ['r|unrelated-supplier', 'i|waste'],
    ]);
    const path = expandFlowFocus(flow, 'o|product', 2, false)!;
    expect(path.nodeIds).toContain('r|first');
    expect(path.nodeIds).toContain('r|second');
    expect(path.nodeIds).not.toContain('r|unrelated-supplier');
  });

  it('terminates downstream and upstream loops and preserves the full graph and rates', () => {
    const flow = downstreamFlow();
    flow.links.push({
      ...flow.links[0],
      id: 'cycle',
      source: 'i|final',
      target: 'r|first',
    });
    const before = JSON.stringify(flow);
    const complete = expandFlowFocus(flow, 'o|product', 10000, true)!;
    expect(new Set(complete.nodeIds).size).toEqual(complete.nodeIds.length);
    expect(new Set(complete.linkIds).size).toEqual(complete.linkIds.length);
    expect(complete.linkIds).toContain('cycle');
    expect(complete.nodeIds).not.toContain('r|unrelated');
    expect(expandFlowFocus(flow, 'o|missing', 2, true)).toBeUndefined();
    expect(JSON.stringify(flow)).toEqual(before);
  });

  it('keeps shared upstream supply without following unrelated downstream branches', () => {
    const flow = graph([
      ['source', 'first'],
      ['source', 'second'],
      ['first', 'o|a'],
      ['second', 'o|b'],
      ['first', 's|waste'],
    ]);
    const paths = buildFlowFocusPaths(flow);
    expect(Object.keys(paths)).toEqual(['o|a', 'o|b']);
    expect(new Set(paths['o|a'].nodeIds)).toEqual(
      new Set(['source', 'first', 'o|a']),
    );
    expect(new Set(paths['o|a'].linkIds)).toEqual(
      new Set(['edge-0', 'edge-2']),
    );
  });

  it('keeps all active recipes supplying the same material', () => {
    const flow = graph([
      ['first', 'material'],
      ['second', 'material'],
      ['material', 'consumer'],
      ['consumer', 'o|a'],
    ]);
    const path = buildFlowFocusPaths(flow)['o|a'];
    expect(new Set(path.nodeIds)).toEqual(
      new Set(flow.nodes.map((node) => node.id)),
    );
    expect(path.linkIds.length).toEqual(4);
  });

  it('offers intermediate materials once without exposing recipe or surplus nodes', () => {
    const flow = graph([
      ['i|source', 'r|producer'],
      ['r|producer', 'i|middle'],
      ['i|middle', 'r|consumer'],
      ['r|consumer', 'i|product'],
      ['i|product', 'o|product'],
      ['i|product', 's|product'],
    ]);
    expect(flowFocusTargets(flow).map((node) => node.id)).toEqual([
      'o|product',
      'i|middle',
    ]);
  });

  it('traces every supplier of an intermediate without following its consumers or coproducts', () => {
    const flow = graph([
      ['r|first', 'i|middle'],
      ['r|second', 'i|middle'],
      ['i|middle', 'r|consumer'],
      ['r|consumer', 'o|product'],
      ['r|first', 'i|coproduct'],
      ['i|coproduct', 's|coproduct'],
    ]);
    const path = buildFlowFocusPaths(flow)['i|middle'];
    const related = focusedFlow(flow, path, 'i|middle');
    expect(new Set(related.nodes.map((node) => node.id))).toEqual(
      new Set(['r|first', 'r|second', 'i|middle']),
    );
    expect(related.links.map((link) => link.id)).toEqual(['edge-0', 'edge-1']);
  });

  it('keeps the upstream recycling loop of an intermediate but not its terminal output', () => {
    const flow = graph([
      ['r|source', 'i|middle'],
      ['i|middle', 'r|recycle'],
      ['r|recycle', 'i|middle'],
      ['i|middle', 'r|consumer'],
      ['r|consumer', 'o|product'],
    ]);
    const path = buildFlowFocusPaths(flow)['i|middle'];
    expect(new Set(path.nodeIds)).toEqual(
      new Set(['r|source', 'i|middle', 'r|recycle']),
    );
    expect(new Set(path.linkIds)).toEqual(
      new Set(['edge-0', 'edge-1', 'edge-2']),
    );
  });

  it('includes recycling loops and stops visiting them without adding other outputs', () => {
    const flow = graph([
      ['source', 'first'],
      ['first', 'second'],
      ['second', 'first'],
      ['second', 'o|a'],
      ['second', 'o|b'],
    ]);
    const path = buildFlowFocusPaths(flow)['o|a'];
    expect(new Set(path.nodeIds)).toEqual(
      new Set(['source', 'first', 'second', 'o|a']),
    );
    expect(new Set(path.linkIds)).toEqual(
      new Set(['edge-0', 'edge-1', 'edge-2', 'edge-3']),
    );
  });

  it('keeps recovery dependencies but does not highlight the unrelated coproduct supply chain', () => {
    const flow = graph([
      ['r|pump', 'i|water'],
      ['i|water', 'r|copper'],
      ['r|copper', 'i|copper'],
      ['i|copper', 'o|copper'],
      ['r|copper', 'i|sewage'],
      ['r|crystal', 'i|sewage'],
      ['i|sewage', 'r|recovery'],
      ['r|recovery', 'i|water'],
      ['i|crystal-ore', 'r|crystal'],
      ['r|crystal', 'o|crystal'],
    ]);
    flow.links[4].byproduct = true;
    flow.links[5].byproduct = true;
    flow.links[7].byproduct = true;
    const path = buildFlowFocusPaths(flow)['o|copper'];
    expect(new Set(path.mainNodeIds)).toEqual(
      new Set(['o|copper', 'i|copper', 'r|copper', 'i|water', 'r|pump']),
    );
    expect(new Set(path.mainLinkIds)).toEqual(
      new Set(['edge-0', 'edge-1', 'edge-2', 'edge-3']),
    );
    expect(path.nodeIds).toContain('r|crystal');
    expect(path.nodeIds).toContain('r|recovery');
    expect(path.nodeIds).not.toContain('o|crystal');
    expect(
      focusedFlow(flow, path).nodes.some((node) => node.id === 'r|crystal'),
    ).toBeTrue();
  });

  it('traces a directly selected coproduct but stops at other coproduct recovery branches', () => {
    const flow = graph([
      ['r|pump', 'i|water'],
      ['i|water', 'r|copper'],
      ['r|copper', 'i|sewage'],
      ['i|sewage', 'r|recovery'],
      ['r|recovery', 'i|water'],
    ]);
    flow.links[2].byproduct = true;
    flow.links[4].byproduct = true;
    const path = buildFlowFocusPaths(flow)['i|sewage'];
    expect(new Set(path.mainNodeIds)).toEqual(
      new Set(['i|sewage', 'r|copper', 'i|water', 'r|pump']),
    );
    expect(path.mainLinkIds).toContain('edge-2');
    expect(path.mainNodeIds).not.toContain('r|recovery');
  });

  it('keeps multiple main suppliers and real mainline recycling loops highlighted', () => {
    const flow = graph([
      ['r|first', 'i|middle'],
      ['r|second', 'i|middle'],
      ['i|middle', 'r|second'],
      ['i|middle', 'r|consumer'],
      ['r|consumer', 'o|product'],
      ['r|recovery', 'i|middle'],
    ]);
    flow.links[5].byproduct = true;
    const path = buildFlowFocusPaths(flow)['o|product'];
    expect(new Set(path.mainNodeIds)).toEqual(
      new Set(['r|first', 'r|second', 'i|middle', 'r|consumer', 'o|product']),
    );
    expect(new Set(path.mainLinkIds)).toEqual(
      new Set(['edge-0', 'edge-1', 'edge-2', 'edge-3', 'edge-4']),
    );
    expect(path.nodeIds).toContain('r|recovery');
  });

  it('retains parallel links and original rates when filtering, without mutating the full graph', () => {
    const flow = graph([
      ['source', 'consumer'],
      ['source', 'consumer'],
      ['consumer', 'o|a'],
      ['consumer', 's|waste'],
    ]);
    const before = JSON.stringify(flow);
    const result = focusedFlow(flow, buildFlowFocusPaths(flow)['o|a']);
    expect(result.links.map((link) => link.id)).toEqual([
      'edge-0',
      'edge-1',
      'edge-2',
    ]);
    expect(
      result.links.every((link) => link.value === 5 && link.text === '5/m'),
    ).toBeTrue();
    expect(result.nodes.every((node) => node.text === '10/m')).toBeTrue();
    expect(JSON.stringify(flow)).toEqual(before);
  });

  it('supports legacy graphs without link IDs', () => {
    const flow = graph([['source', 'o|a']]);
    delete flow.links[0].id;
    expect(flowLinkId(flow.links[0], 0)).toEqual('flow-link-0');
    const result = focusedFlow(flow, buildFlowFocusPaths(flow)['o|a']);
    expect(result.links[0].id).toEqual('flow-link-0');
    expect(flow.links[0].id).toBeUndefined();
  });

  it('does not treat surplus nodes as selectable targets', () => {
    expect(buildFlowFocusPaths(graph([['source', 's|waste']]))).toEqual({});
  });
});
