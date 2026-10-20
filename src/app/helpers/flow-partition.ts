import {
  FlowData,
  FlowFocusPath,
  FlowSection,
  FlowWarehousePort,
  Link,
} from '~/models/flow';
import { rational } from '~/models/rational';
import { FlowBaseSettings } from '~/models/settings/flow-partition-settings';

import { flowLinkId } from './flow-focus';

export const MAIN_BASE_ID = 'main';

export function rawFlow(flow: FlowData): FlowData {
  return {
    nodes: flow.focusGraph?.nodes ?? flow.nodes,
    links: flow.focusGraph?.links ?? flow.links,
    modId: flow.modId,
    rateSuffix: flow.rateSuffix,
    extractionItemIds: flow.extractionItemIds,
  };
}

export function isFlowRecipe(id: string): boolean {
  return id.startsWith('r|') || id.startsWith('m|');
}

/** Assign upstream production to bases, keeping local circulation out of storage. */
export function partitionFlow(
  flow: FlowData,
  bases: readonly FlowBaseSettings[],
  labels: { input: string; output: string; main?: string; base?: string },
  precision = 2,
): FlowSection[] {
  const raw = rawFlow(flow);
  const links = raw.links.map((link, index) => ({
    ...link,
    id: flowLinkId(link, index),
  }));
  const incoming = new Map<string, Link[]>();
  const outgoing = new Map<string, Link[]>();
  // Input-free extraction is a shared raw-material supply, not a production
  // chain to move into the first base that happens to use it. Extraction
  // equipment remains in the complete flow/list; previews allocate materials.
  const extractionIds = new Set(
    raw.nodes
      .filter(
        (node) =>
          node.recipe?.flags.has('mining') &&
          Object.keys(node.recipe.in).length === 0,
      )
      .map((node) => node.id),
  );
  const extractionMaterials = new Set([
    ...(flow.extractionItemIds ?? []).map((id) => `i|${id}`),
    ...raw.links
      .filter((link) => extractionIds.has(link.source))
      .map((link) => link.target),
  ]);
  for (const link of links) {
    incoming.set(link.target, [...(incoming.get(link.target) ?? []), link]);
    outgoing.set(link.source, [...(outgoing.get(link.source) ?? []), link]);
  }
  const producers = (id: string, includeByproducts = true): string[] =>
    (extractionMaterials.has(id) && !includeByproducts
      ? []
      : (incoming.get(id) ?? [])
    )
      .filter(
        (link) =>
          isFlowRecipe(link.source) &&
          !extractionIds.has(link.source) &&
          (includeByproducts || !link.byproduct),
      )
      .map((link) => link.source);
  const owners = new Map<string, string>();
  const outputOwners = new Map<string, string>();
  // Reserve explicit final-output recipes before expanding any upstream chain.
  for (const base of bases) {
    for (const itemId of base.outputItemIds) {
      const id = `i|${itemId}`;
      if (!outputOwners.has(id)) outputOwners.set(id, base.id);
      for (const recipeId of producers(id))
        if (!owners.has(recipeId)) owners.set(recipeId, base.id);
    }
  }
  for (const base of bases) {
    const pending = base.outputItemIds.flatMap((itemId) =>
      producers(`i|${itemId}`),
    );
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop();
      if (id === undefined) continue;
      if (visited.has(id) || (owners.has(id) && owners.get(id) !== base.id))
        continue;
      visited.add(id);
      owners.set(id, base.id);
      for (const input of incoming.get(id) ?? []) {
        if (isFlowRecipe(input.source)) pending.push(input.source);
        else if (
          !outputOwners.has(input.source) ||
          outputOwners.get(input.source) === base.id
        )
          pending.push(...producers(input.source, false));
      }
    }
  }
  for (const node of raw.nodes.filter((node) => isFlowRecipe(node.id)))
    if (!owners.has(node.id)) owners.set(node.id, MAIN_BASE_ID);
  const owner = (id: string): string => owners.get(id) ?? MAIN_BASE_ID;
  const definitions = [
    {
      id: MAIN_BASE_ID,
      name: labels.main || 'Main base',
      outputItemIds: [] as string[],
    },
    ...bases,
  ];
  const sum = (matches: Link[]): string =>
    matches
      .reduce(
        (total, link) => total.add(rational(link.amount ?? 0)),
        rational.zero,
      )
      .toFraction(false);
  const sections: FlowSection[] = definitions.map((base, index) => ({
    id: base.id,
    name: base.name || `${labels.base || 'Sub-base'} ${String(index)}`,
    recipeNodeIds: raw.nodes
      .filter(
        (node) =>
          isFlowRecipe(node.id) &&
          !extractionIds.has(node.id) &&
          owner(node.id) === base.id,
      )
      .map((node) => node.id),
    outputItemIds: [...base.outputItemIds],
    sharedOutputs: base.outputItemIds.flatMap((itemId) =>
      [...new Set(producers(`i|${itemId}`).map(owner))]
        .filter((id) => id !== base.id)
        .map((baseId) => ({ itemId, baseId })),
    ),
    flow: {
      nodes: [],
      links: [],
      modId: flow.modId,
      rateSuffix: flow.rateSuffix,
      extractionItemIds: flow.extractionItemIds,
    },
  }));
  const sectionMap = new Map(sections.map((section) => [section.id, section]));
  for (const node of raw.nodes)
    if (
      (isFlowRecipe(node.id) && !extractionIds.has(node.id)) ||
      node.id.startsWith('o|') ||
      node.id.startsWith('s|')
    )
      sectionMap.get(owner(node.id))?.flow.nodes.push({ ...node });
  for (const link of links)
    if (
      !link.source.startsWith('i|') &&
      !link.target.startsWith('i|') &&
      !extractionIds.has(link.source) &&
      !extractionIds.has(link.target) &&
      owner(link.source) === owner(link.target)
    )
      sectionMap.get(owner(link.source))?.flow.links.push({ ...link });
  for (const material of raw.nodes.filter((node) => node.id.startsWith('i|'))) {
    const supplies = incoming.get(material.id) ?? [];
    const extracted = extractionMaterials.has(material.id);
    const ins = supplies.filter((link) => !extractionIds.has(link.source));
    const outs = outgoing.get(material.id) ?? [];
    const supplied = ins.some((link) => isFlowRecipe(link.source));
    const memberOwners = new Set([
      ...ins.map((link) => owner(link.source)),
      ...outs.map((link) => owner(link.target)),
    ]);
    const warehouse =
      !extracted &&
      supplied &&
      (memberOwners.size > 1 || outputOwners.has(material.id));
    for (const section of sections) {
      const localIns = ins.filter((link) => owner(link.source) === section.id);
      const localOuts = outs.filter(
        (link) => owner(link.target) === section.id,
      );
      if (!localIns.length && !localOuts.length) continue;
      const production = rational(sum(localIns));
      const consumption = rational(sum(localOuts));
      const addMaterial = (): void => {
        const amount = (
          production.gt(consumption) ? production : consumption
        ).toFraction(false);
        section.flow.nodes.push({
          ...material,
          amount,
          text: `${rational(amount).toString(precision)}${flow.rateSuffix ?? ''}`,
        });
        section.flow.links.push(
          ...[...localIns, ...localOuts].map((link) => ({ ...link })),
        );
      };
      if (warehouse) {
        // Local production serves local consumers first. Only the remainder
        // crosses the base boundary, even when this material also feeds a loop.
        const balance = production.sub(consumption);
        if (balance.isZero()) {
          addMaterial();
          continue;
        }
        const direction = balance.gt(rational.zero) ? 'output' : 'input';
        const matches = direction === 'input' ? localOuts : localIns;
        const portId = `w|${section.id}|${direction}|${material.id.slice(2)}`;
        const amount = balance.abs().toFraction(false);
        const port: FlowWarehousePort = {
          itemId: material.id.slice(2),
          direction,
          amount,
          linkIds: matches.map((link) => flowLinkId(link, 0)),
        };
        section.flow.nodes.push({
          ...material,
          id: portId,
          amount,
          warehouse: port,
          text: `${material.name} · ${labels[direction]}\n${rational(amount).toString(precision)}${flow.rateSuffix ?? ''}`,
        });
        if (!localIns.length || !localOuts.length) {
          section.flow.links.push(
            ...matches.map((link) => ({
              ...link,
              name: `${material.name} · ${labels[direction]}`,
              source: direction === 'input' ? portId : link.source,
              target: direction === 'output' ? portId : link.target,
            })),
          );
        } else {
          addMaterial();
          const rate = rational(amount);
          section.flow.links.push({
            ...matches[0],
            id: `transfer|${section.id}|${direction}|${material.id.slice(2)}`,
            source: direction === 'input' ? portId : material.id,
            target: direction === 'output' ? portId : material.id,
            amount,
            name: `${material.name} · ${labels[direction]}`,
            text: '',
            value:
              matches.reduce((total, link) => total + link.value, 0) *
              rate.div(rational(sum(matches))).toNumber(),
          });
        }
      } else {
        addMaterial();
      }
    }
  }
  // Keep ordinary intermediate-node simplification, but preserve warehouse endpoints.
  for (const section of sections) {
    const aliases = new Map<string, string>();
    const sectionLinks = section.flow.links;
    for (const node of section.flow.nodes.filter((node) =>
      node.id.startsWith('i|'),
    )) {
      const ins = sectionLinks.filter((link) => link.target === node.id);
      if (
        ins.length === 1 &&
        !ins[0].byproduct &&
        sectionLinks.filter(
          (link) => link.source === ins[0].source && !link.byproduct,
        ).length === 1
      )
        aliases.set(node.id, ins[0].source);
    }
    section.flow.focusGraph = {
      nodes: section.flow.nodes,
      links: sectionLinks,
      nodeAliases: Object.fromEntries(aliases),
      paths: {},
    };
    section.flow.nodes = section.flow.nodes.filter(
      (node) => !aliases.has(node.id),
    );
    section.flow.links = sectionLinks
      .filter((link) => !aliases.has(link.target))
      .map((link) => ({
        ...link,
        source: aliases.get(link.source) ?? link.source,
      }));
  }
  return sections;
}

export function sectionFocus(
  section: FlowSection,
  path: FlowFocusPath,
): FlowFocusPath {
  const nodes = new Set(path.nodeIds);
  const links = new Set(path.linkIds);
  const aliases = section.flow.focusGraph?.nodeAliases ?? {};
  const ports = new Map(
    section.flow.nodes.flatMap((node) =>
      node.warehouse ? [[node.id, node.warehouse] as const] : [],
    ),
  );
  const projected = new Set(
    [...nodes]
      .filter((id) => !aliases[id] || nodes.has(aliases[id]))
      .map((id) => aliases[id] ?? id),
  );
  return {
    nodeIds: section.flow.nodes
      .filter((node) =>
        node.warehouse
          ? node.warehouse.linkIds.some((id) => links.has(id))
          : projected.has(node.id),
      )
      .map((node) => node.id),
    linkIds: section.flow.links
      .filter(
        (link, index) =>
          links.has(flowLinkId(link, index)) ||
          (link.id?.startsWith('transfer|') &&
            [ports.get(link.source), ports.get(link.target)].some((port) =>
              port?.linkIds.some((id) => links.has(id)),
            )),
      )
      .map(flowLinkId),
  };
}

export function warehouseTotals(
  flow: FlowData,
  itemId: string,
): { supply: string; consumption: string; output: string; surplus: string } {
  const raw = rawFlow(flow);
  const id = `i|${itemId}`;
  const outgoing = raw.links.filter((link) => link.source === id);
  const sum = (matches: Link[]): string =>
    matches
      .reduce(
        (total, link) => total.add(rational(link.amount ?? 0)),
        rational.zero,
      )
      .toFraction(false);
  return {
    supply: raw.nodes.find((node) => node.id === id)?.amount ?? '0',
    consumption: sum(outgoing.filter((link) => isFlowRecipe(link.target))),
    output: sum(outgoing.filter((link) => link.target.startsWith('o|'))),
    surplus: sum(outgoing.filter((link) => link.target.startsWith('s|'))),
  };
}
