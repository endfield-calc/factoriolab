import { InjectionToken, Type } from '@angular/core';

import type { FlowData } from '~/flow/flow-data';
import type { Node } from '~/flow/node';
import { Step } from '~/solver/step';
import { RecipeState } from '~/state/recipes/recipe-state';

export type PresentationNode = Node & { objectiveLabel?: string };
export type PresentationFlowData = Omit<FlowData, 'nodes'> & {
  nodes: PresentationNode[];
};

export type StepOwner =
  | { readonly kind: 'objective'; readonly id: string }
  | { readonly kind: 'recipe'; readonly id: string }
  | { readonly kind: 'extension'; readonly id: string };

export interface PresentationExtension {
  readonly mainPanels: readonly Type<unknown>[];
  readonly costPanels: readonly Type<unknown>[];
  readonly showPreset: boolean;
  readonly showPowerUnit: boolean;
  readonly showNameToggle: boolean;
  readonly nameToggleLabel: string;
  costsModified(): boolean;
  resetCosts(): void;
  showNames(): boolean;
  toggleNames(): void;
  hideDuplicateIcons(): boolean;
  hideProducer(recipeId: string): boolean;
  forceLabel(recipeId: string): boolean;
  owner(step: Step): StepOwner | undefined;
  updateRecipeField<K extends keyof RecipeState>(
    owner: StepOwner,
    field: K,
    value: RecipeState[K],
    def?: RecipeState[K],
  ): boolean;
  resetRecipe(owner: StepOwner): boolean;
  checked(step: Step): boolean | undefined;
  toggleChecked(step: Step, checked: boolean): boolean;
  clearChecked(): void;
  hasChecked(): boolean;
  modified(owner?: StepOwner, fields?: readonly (keyof RecipeState)[]): boolean;
  resetRecipes(fields: readonly (keyof RecipeState)[]): void;
  sourceLabel(step: Step): string | undefined;
  workspaceLink(step: Step): boolean;
  stepFragment(step: Step): string | undefined;
}

export const upstreamPresentation: PresentationExtension = {
  mainPanels: [],
  costPanels: [],
  showPreset: true,
  showPowerUnit: true,
  showNameToggle: false,
  nameToggleLabel: 'Name',
  costsModified: () => false,
  resetCosts: () => undefined,
  showNames: () => false,
  toggleNames: () => undefined,
  hideDuplicateIcons: () => false,
  hideProducer: () => false,
  forceLabel: () => false,
  owner: (step) =>
    step.recipeObjectiveId
      ? { kind: 'objective', id: step.recipeObjectiveId }
      : step.recipeId
        ? { kind: 'recipe', id: step.recipeId }
        : undefined,
  updateRecipeField: () => false,
  resetRecipe: () => false,
  checked: () => undefined,
  toggleChecked: () => false,
  clearChecked: () => undefined,
  hasChecked: () => false,
  modified: () => false,
  resetRecipes: () => undefined,
  sourceLabel: () => undefined,
  workspaceLink: () => false,
  stepFragment: () => undefined,
};
export const PRESENTATION_EXTENSION = new InjectionToken<PresentationExtension>(
  'PRESENTATION_EXTENSION',
  { factory: (): PresentationExtension => upstreamPresentation },
);
