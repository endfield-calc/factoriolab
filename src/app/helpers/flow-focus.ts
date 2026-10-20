import { FlowData, FlowFocusPath, FlowFocusTarget, Link } from '~/models/flow';

export function flowLinkId(link: Link, index: number): string {
  return link.id ?? `flow-link-${String(index)}`;
}

export function flowFocusTargets(flow: FlowData): FlowFocusTarget[] {
  if (flow.focusTargets) return flow.focusTargets;
  const outputs = flow.nodes.filter((node) => node.id.startsWith('o|'));
  const outputItems = new Set(outputs.map((node) => node.id.slice(2)));
  const suppliedNodes = new Set(flow.links.map((link) => link.target));
  return [
    ...outputs,
    ...flow.nodes.filter(
      (node) =>
        node.id.startsWith('i|') &&
        suppliedNodes.has(node.id) &&
        !outputItems.has(node.id.slice(2)),
    ),
  ].map((node) => ({ ...node, nodeId: node.id }));
}

export function buildFlowFocusPaths(
  flow: FlowData,
): Record<string, FlowFocusPath> {
  const incoming = new Map<
    string,
    { source: string; id: string; byproduct?: boolean }[]
  >();
  flow.links.forEach((link, index) => {
    const links = incoming.get(link.target) ?? [];
    links.push({
      source: link.source,
      id: flowLinkId(link, index),
      byproduct: link.byproduct,
    });
    incoming.set(link.target, links);
  });
  const trace = (
    targetId: string,
    includeByproducts: boolean,
  ): FlowFocusPath => {
    const nodes = new Set<string>();
    const links = new Set<string>();
    const materialId = `i|${targetId.slice(2)}`;
    const pending = [targetId];
    while (pending.length) {
      const id = pending.pop();
      if (id === undefined || nodes.has(id)) continue;
      nodes.add(id);
      for (const link of incoming.get(id) ?? []) {
        // Directly selected coproducts are traced normally; other recovery
        // branches stay in the full dependency graph without becoming mainline.
        if (!includeByproducts && link.byproduct && id !== materialId) continue;
        links.add(link.id);
        pending.push(link.source);
      }
    }
    return { nodeIds: [...nodes], linkIds: [...links] };
  };
  const paths: Record<string, FlowFocusPath> = {};
  for (const target of flowFocusTargets(flow)) {
    const main = trace(target.id, false);
    paths[target.id] = {
      ...trace(target.id, true),
      mainNodeIds: main.nodeIds,
      mainLinkIds: main.linkIds,
    };
  }
  return paths;
}

export function expandFlowFocus(
  flow: FlowData,
  targetId: string,
  depth: number,
  traceInputs: boolean,
): FlowFocusPath | undefined {
  const graph = flow.focusGraph;
  const path =
    graph?.paths[targetId] ??
    flow.focusPaths?.[targetId] ??
    buildFlowFocusPaths(flow)[targetId];
  if (!path) return undefined;
  const nodeIds = new Set(path.mainNodeIds ?? path.nodeIds);
  const linkIds = new Set(path.mainLinkIds ?? path.linkIds);
  const links = (graph?.links ?? flow.links).map((link, index) => ({
    ...link,
    id: flowLinkId(link, index),
  }));
  const incoming = new Map<string, typeof links>();
  const outgoing = new Map<string, typeof links>();
  for (const link of links) {
    const ins = incoming.get(link.target) ?? [];
    ins.push(link);
    incoming.set(link.target, ins);
    const outs = outgoing.get(link.source) ?? [];
    outs.push(link);
    outgoing.set(link.source, outs);
  }
  const includeLink = (link: (typeof links)[number]): void => {
    nodeIds.add(link.source);
    nodeIds.add(link.target);
    linkIds.add(link.id);
  };
  const includeEndpoints = (id: string): void => {
    for (const link of outgoing.get(id) ?? []) {
      if (link.target.startsWith('o|') || link.target.startsWith('s|'))
        includeLink(link);
    }
  };
  const mainRecipes = new Set(
    [...nodeIds].filter((id) => id.startsWith('r|') || id.startsWith('m|')),
  );
  const frontier: string[] = [];
  if (Number.isFinite(depth) && depth >= 1) {
    for (const id of mainRecipes) {
      for (const link of outgoing.get(id) ?? []) {
        if (linkIds.has(link.id) || !link.target.startsWith('i|')) continue;
        includeLink(link);
        includeEndpoints(link.target);
        frontier.push(link.target);
      }
    }
  }
  const visitedMaterials = new Set<string>();
  const expandedRecipes = new Set(mainRecipes);
  const inputRecipes = new Set<string>();
  // Only downstream processing consumes a level. Supplying extra ingredients
  // never becomes a new downstream seed, including in recycling loops.
  let pending = frontier;
  for (let level = 2; level <= Math.floor(depth) && pending.length; level++) {
    const next: string[] = [];
    for (const id of pending) {
      if (visitedMaterials.has(id)) continue;
      visitedMaterials.add(id);
      for (const link of outgoing.get(id) ?? []) {
        if (!link.target.startsWith('r|') && !link.target.startsWith('m|'))
          continue;
        includeLink(link);
        const recipeId = link.target;
        if (expandedRecipes.has(recipeId)) continue;
        expandedRecipes.add(recipeId);
        inputRecipes.add(recipeId);
        for (const input of incoming.get(recipeId) ?? []) includeLink(input);
        for (const output of outgoing.get(recipeId) ?? []) {
          includeLink(output);
          includeEndpoints(output.target);
          if (output.target.startsWith('i|')) next.push(output.target);
        }
      }
    }
    pending = next;
  }
  if (traceInputs && inputRecipes.size) {
    const visited = new Set<string>();
    const pending = [...inputRecipes];
    while (pending.length) {
      const id = pending.pop();
      if (id === undefined || visited.has(id)) continue;
      visited.add(id);
      for (const link of incoming.get(id) ?? []) {
        includeLink(link);
        pending.push(link.source);
      }
    }
  }
  const aliases = graph?.nodeAliases ?? {};
  const mappedNodes = new Set<string>();
  for (const id of nodeIds) {
    const producerId = aliases[id];
    if (!producerId) mappedNodes.add(id);
    else if (nodeIds.has(producerId)) mappedNodes.add(producerId);
  }
  const visibleLinks = new Set(flow.links.map(flowLinkId));
  return {
    nodeIds: [...mappedNodes],
    // A material merged into an untraced supplier is still labelled on the
    // input edge. Highlight that edge without promoting the supplier node.
    linkIds: [...linkIds].filter((id) => visibleLinks.has(id)),
  };
}

export function focusedFlow(
  flow: FlowData,
  path: FlowFocusPath,
  targetId?: string,
): FlowData {
  const nodeIds = new Set(path.nodeIds);
  const linkIds = new Set(path.linkIds);
  const nodes = flow.nodes.filter((node) => nodeIds.has(node.id));
  const rawNodes = new Map(
    (flow.focusGraph?.nodes ?? [...flow.nodes, ...flowFocusTargets(flow)]).map(
      (node) => [node.id, node],
    ),
  );
  const rawLinks = new Map(
    flow.focusGraph?.links.map((link, index) => [
      flowLinkId(link, index),
      link,
    ]),
  );
  const links = flow.links
    .map((link, index) => ({ ...link, id: flowLinkId(link, index) }))
    .filter((link) => linkIds.has(link.id))
    .filter((link) => {
      // A highlighted ingredient may be merged into an untraced supplier.
      // Restore that ingredient as a boundary instead of showing its supplier.
      const rawLink = rawLinks.get(link.id);
      for (const endpoint of ['source', 'target'] as const) {
        if (nodeIds.has(link[endpoint])) continue;
        const rawId = rawLink?.[endpoint];
        const node = rawId ? rawNodes.get(rawId) : undefined;
        if (!node || flow.focusGraph?.nodeAliases[node.id] !== link[endpoint])
          return false;
        link[endpoint] = node.id;
        if (!nodeIds.has(node.id)) {
          nodes.push(node);
          nodeIds.add(node.id);
        }
      }
      return true;
    });
  const target = flow.focusTargets?.find((node) => node.id === targetId);
  // Restore a merged material endpoint, including its role in recycling loops.
  if (target?.link && !nodes.some((node) => node.id === target.id)) {
    nodes.push(target);
    const outgoingIds = new Set(target.outgoingLinkIds);
    for (const link of links) {
      if (outgoingIds.has(link.id)) link.source = target.id;
    }
    links.push({
      ...target.link,
      id: flowLinkId(target.link, flow.links.length),
    });
  }
  return { ...flow, nodes, links };
}
