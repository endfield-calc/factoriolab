import { Recipe } from './data/recipe';

export interface FlowData {
  nodes: Node[];
  links: Link[];
  modId?: string;
  rateSuffix?: string;
  /** Materials available directly through input-free extraction recipes. */
  extractionItemIds?: string[];
  focusTargets?: FlowFocusTarget[];
  focusPaths?: Record<string, FlowFocusPath>;
  focusGraph?: {
    nodes?: Node[];
    links: Link[];
    nodeAliases: Record<string, string>;
    paths: Record<string, FlowFocusPath>;
  };
}

export interface FlowFocusTarget extends Node {
  nodeId: string;
  link?: Link;
  outgoingLinkIds?: string[];
}

export interface FlowFocusPath {
  nodeIds: string[];
  linkIds: string[];
  mainNodeIds?: string[];
  mainLinkIds?: string[];
}

export interface FlowBase {
  name: string;
  text: string;
  color: string;
}

export interface Node extends FlowBase {
  id: string;
  recipe?: Recipe;
  machines?: string;
  machineId?: string;
  /** Exact material rate in the current display unit. */
  amount?: string;
  warehouse?: FlowWarehousePort;
  /** A local view of one shared external supply; not an additional producer. */
  publicSupply?: {
    itemId: string;
    sourceNodeId: string;
    amount: string;
    linkIds: string[];
  };

  stepId: string;
  posX: string;
  posY: string;
  viewBox: string;
  href: string;
}

export interface Link extends FlowBase {
  id?: string;
  byproduct?: boolean;
  source: string;
  target: string;
  value: number;
  /** Material rate independent of line width/text display preferences. */
  amount?: string;
}

export interface FlowWarehousePort {
  itemId: string;
  direction: 'input' | 'output';
  amount: string;
  linkIds: string[];
}

export interface FlowSection {
  id: string;
  name: string;
  recipeNodeIds: string[];
  outputItemIds: string[];
  sharedOutputs: { itemId: string; baseId: string }[];
  flow: FlowData;
}
