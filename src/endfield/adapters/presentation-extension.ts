import { Type } from '@angular/core';

import {
  PresentationExtension,
  StepOwner,
  upstreamPresentation,
} from '~/extensions/presentation-extension';
import { rational } from '~/rational/rational';
import { Step } from '~/solver/step';
import { RecipeState } from '~/state/recipes/recipe-state';

import {
  ResourceId,
  resourceIds,
  resourceObjectiveId,
  resourceOwner,
} from '../domain/model';
import { EndfieldStore } from '../state/endfield-store';

function ownerResource(owner: StepOwner | undefined): ResourceId | undefined {
  return owner?.kind === 'extension'
    ? resourceIds.find((id) => resourceOwner(id) === owner.id)
    : undefined;
}

function derivedResource(step: Step): ResourceId | undefined {
  return resourceIds.find(
    (id) => resourceObjectiveId(id) === step.recipeObjectiveId,
  );
}

export function createEndfieldPresentation(
  store: EndfieldStore,
  mainPanels: readonly Type<unknown>[] = [],
): PresentationExtension {
  return {
    ...upstreamPresentation,
    mainPanels,
    additionalCost: {
      label: 'endfield.electric.title',
      description: 'endfield.electric.description',
      defaultValue: rational.one,
      value: () => store.state().electric,
      save: (value): void => {
        store.set({ ...store.state(), electric: value });
      },
    },
    showPreset: false,
    showPowerUnit: false,
    showNameToggle: true,
    nameToggleLabel: 'endfield.picker.showNames',
    owner: (step): StepOwner | undefined => {
      const resource = derivedResource(step);
      return resource == null
        ? upstreamPresentation.owner(step)
        : { kind: 'extension', id: resourceOwner(resource) };
    },
    updateRecipeField: (owner, field, value, def): boolean => {
      const resource = ownerResource(owner);
      if (resource == null) return false;
      store.updateRecipeField(resource, field, value, def);
      return true;
    },
    resetRecipe: (owner): boolean => {
      const resource = ownerResource(owner);
      if (resource == null) return false;
      store.resetRecipe(resource);
      return true;
    },
    checked: (step): boolean | undefined => {
      const resource = derivedResource(step);
      return step.itemId != null || resource == null
        ? undefined
        : store.state().checkedDerived.has(resourceOwner(resource));
    },
    toggleChecked: (step, checked): boolean => {
      const resource = derivedResource(step);
      if (step.itemId != null || resource == null) return false;
      store.toggleDerived(resourceOwner(resource), checked);
      return true;
    },
    clearChecked: (): void => {
      store.clearDerived();
    },
    hasChecked: () => store.state().checkedDerived.size > 0,
    modified: (owner, fields): boolean => {
      const resource = ownerResource(owner);
      const values =
        owner == null
          ? Object.values(store.state().resourceRecipeSettings)
          : resource == null
            ? []
            : [store.state().resourceRecipeSettings[resource]];
      return values.some(
        (value) =>
          value != null &&
          (fields == null
            ? Object.values(value).some((v) => v != null)
            : fields.some((field) => value[field] != null)),
      );
    },
    resetRecipes: (fields: readonly (keyof RecipeState)[]): void => {
      for (const resource of resourceIds)
        for (const field of fields)
          store.updateRecipeField(resource, field, undefined);
    },
    sourceLabel: (step) =>
      derivedResource(step) == null ? undefined : 'endfield.resources.source',
    workspaceLink: (step) => derivedResource(step) != null,
    stepFragment: (step) =>
      derivedResource(step) == null ? undefined : 'endfield-resources',
  };
}
