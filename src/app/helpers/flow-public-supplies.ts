import { FlowData, FlowFocusPath, Link, Node } from '~/models/flow';
import { rational } from '~/models/rational';

import { flowLinkId } from './flow-focus';

const isRecipe = (id: string): boolean =>
  id.startsWith('r|') || id.startsWith('m|');

const isExtraction = (node: Node | undefined): boolean =>
  !!node?.recipe?.flags.has('mining') &&
  Object.keys(node.recipe.in).length === 0;

/** Production levels are independent of renderer layout and public-supply edges.
 * Collapse recycling loops before counting stages so cycles cannot inflate them.
 */
function productionStages(
  nodes: Node[],
  links: Link[],
  publicIds: Set<string>,
): Map<string, number> {
  const recipes = nodes.filter((node) => isRecipe(node.id));
  const predecessors = new Map<string, Set<string>>(
    recipes.map((node) => [node.id, new Set<string>()]),
  );
  const producers = new Map<string, string[]>();
  for (const link of links) {
    if (!isRecipe(link.source)) continue;
    const list = producers.get(link.target) ?? [];
    list.push(link.source);
    producers.set(link.target, list);
  }
  for (const link of links) {
    if (!isRecipe(link.target) || publicIds.has(link.source)) continue;
    const suppliers = isRecipe(link.source)
      ? [link.source]
      : (producers.get(link.source) ?? []);
    for (const supplier of suppliers)
      if (predecessors.has(supplier))
        predecessors.get(link.target)?.add(supplier);
  }
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lows = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const visit = (id: string): void => {
    const index = nextIndex++;
    indices.set(id, index);
    lows.set(id, index);
    stack.push(id);
    onStack.add(id);
    for (const parent of predecessors.get(id) ?? []) {
      if (!indices.has(parent)) {
        visit(parent);
        lows.set(
          id,
          Math.min(lows.get(id) ?? index, lows.get(parent) ?? index),
        );
      } else if (onStack.has(parent)) {
        lows.set(
          id,
          Math.min(lows.get(id) ?? index, indices.get(parent) ?? index),
        );
      }
    }
    if (lows.get(id) !== index) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop() ?? id;
      onStack.delete(member);
      component.push(member);
    } while (member !== id);
    components.push(component);
  };
  for (const node of recipes) if (!indices.has(node.id)) visit(node.id);
  const owners = new Map(
    components.flatMap((ids, index) => ids.map((id) => [id, index] as const)),
  );
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const levels = new Map<number, number>();
  const level = (index: number): number => {
    const cached = levels.get(index);
    if (cached !== undefined) return cached;
    let upstream = 0;
    for (const id of components[index])
      for (const parent of predecessors.get(id) ?? []) {
        const owner = owners.get(parent);
        if (owner !== undefined && owner !== index)
          upstream = Math.max(upstream, level(owner));
      }
    const cost = components[index].some((id) => !isExtraction(nodeMap.get(id)))
      ? 1
      : 0;
    const result = upstream + cost;
    levels.set(index, result);
    return result;
  };
  return new Map(
    recipes.map((node) => {
      const owner = owners.get(node.id);
      return [node.id, owner === undefined ? 0 : level(owner)];
    }),
  );
}

/** Split only genuine external entrances. Produced/recovered materials and
 * warehouse transfers keep their actual suppliers and recycling connections.
 * All original consumption edges, exact amounts and equipment remain singular.
 */
export function localizePublicSupplies(
  flow: FlowData,
  enabled: boolean,
  itemIds: string[],
  precision: number | null = 2,
): FlowData {
  if (!enabled || !itemIds.length) return flow;
  const rawNodes = flow.focusGraph?.nodes ?? flow.nodes;
  const rawLinks = flow.focusGraph?.links ?? flow.links;
  const rawNodeMap = new Map(rawNodes.map((node) => [node.id, node]));
  const publicIds = new Set(
    itemIds
      .map((id) => `i|${id}`)
      .filter((id) => {
        const sourceId = flow.focusGraph?.nodeAliases[id] ?? id;
        const source = flow.nodes.find((node) => node.id === sourceId);
        if (
          !rawNodeMap.has(id) ||
          !source ||
          source.warehouse ||
          source.publicSupply
        )
          return false;
        const incoming = rawLinks.filter((link) => link.target === id);
        // A merged, single-output extraction device can appear on the first
        // entrance only. Never copy production equipment or detach recovery lines.
        return (
          incoming.length <= 1 &&
          incoming.every((link) => {
            const producer = rawNodeMap.get(link.source);
            return (
              !!producer?.recipe &&
              isExtraction(producer) &&
              Object.keys(producer.recipe.out).length === 1 &&
              sourceId === producer.id
            );
          })
        );
      }),
  );
  if (!publicIds.size) return flow;
  const stages = productionStages(rawNodes, rawLinks, publicIds);
  let nodes = [...flow.nodes];
  let links = flow.links.map((link, index) => ({
    ...link,
    id: flowLinkId(link, index),
  }));
  let changed = false;
  for (const itemId of new Set(itemIds)) {
    const id = `i|${itemId}`;
    if (!publicIds.has(id)) continue;
    const material = rawNodeMap.get(id);
    const sourceId = flow.focusGraph?.nodeAliases[id] ?? id;
    const source = nodes.find((node) => node.id === sourceId);
    if (!material || !source || source.warehouse || source.publicSupply)
      continue;
    const outgoing = links.filter((link) => link.source === sourceId);
    if (
      outgoing.length < 2 ||
      outgoing.some(
        (link) => !isRecipe(link.target) || link.amount === undefined,
      )
    )
      continue;
    const sorted = [...outgoing].sort(
      (a, b) => (stages.get(a.target) ?? 0) - (stages.get(b.target) ?? 0),
    );
    const groups: Link[][] = [];
    for (const link of sorted) {
      const group = groups[groups.length - 1];
      if (
        !group ||
        (stages.get(link.target) ?? 0) - (stages.get(group[0].target) ?? 0) >= 3
      )
        groups.push([link]);
      else group.push(link);
    }
    if (groups.length < 2) continue;
    changed = true;
    nodes = nodes.filter((node) => node.id !== sourceId);
    groups.forEach((group, index) => {
      const amount = group.reduce(
        (total, link) => total.add(rational(link.amount ?? 0)),
        rational.zero,
      );
      const copyId =
        index === 0 ? sourceId : `public|${itemId}|${String(index)}`;
      const linkIds = group.map(flowLinkId);
      const localText = amount.toString(precision) + (flow.rateSuffix ?? '');
      nodes.push({
        ...(index === 0 ? source : material),
        id: copyId,
        name: material.name,
        amount: amount.toFraction(false),
        // Keep the one real extraction device and its original machine count.
        text:
          index === 0 && source.recipe
            ? `${localText}\n${source.text}`
            : localText,
        publicSupply: {
          itemId,
          sourceNodeId: sourceId,
          amount: amount.toFraction(false),
          linkIds,
        },
      });
      const groupIds = new Set(linkIds);
      links = links.map((link) =>
        groupIds.has(link.id) ? { ...link, source: copyId } : link,
      );
    });
  }
  return changed ? { ...flow, nodes, links } : flow;
}

/** Focus each entrance by its assigned original edges, not by the shared node. */
export function publicSupplyFocus(
  flow: FlowData,
  path: FlowFocusPath,
  targetId?: string,
): FlowFocusPath {
  const nodes = new Set(path.nodeIds);
  const links = new Set(path.linkIds);
  const entrances = flow.nodes.flatMap((node) =>
    node.publicSupply ? [{ node, supply: node.publicSupply }] : [],
  );
  for (const { supply } of entrances) nodes.delete(supply.sourceNodeId);
  for (const { node, supply } of entrances)
    if (
      targetId === `i|${supply.itemId}` ||
      targetId === `o|${supply.itemId}` ||
      supply.linkIds.some((id) => links.has(id))
    )
      nodes.add(node.id);
  return { ...path, nodeIds: [...nodes] };
}
