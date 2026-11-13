import { inject, Service, signal } from '@angular/core';

import {
  EndfieldState,
  ResourceId,
  resourceIds,
  resourceOwner,
} from '~/endfield/domain/model';
import { immutableValue } from '~/extensions/immutable';
import { EFFECTIVE_DEFAULTS } from '~/extensions/product-profile';
import { Rational } from '~/rational/rational';
import { RecipeState } from '~/state/recipes/recipe-state';

function assertResource(id: string): asserts id is ResourceId {
  if (!resourceIds.some((resource) => resource === id))
    throw new Error(`Unknown resource ID: ${id}`);
}

function assertOwner(owner: string): void {
  if (!resourceIds.some((id) => resourceOwner(id) === owner))
    throw new Error(`Unknown derived owner: ${owner}`);
}

/** Independent extension state; ordinary objectives and settings remain upstream. */
@Service()
export class EndfieldStore {
  private readonly defaults = inject(EFFECTIVE_DEFAULTS)
    .extension as EndfieldState;
  private readonly _state = signal<EndfieldState>(
    immutableValue(this.defaults),
  );
  readonly state = this._state.asReadonly();

  snapshot(): EndfieldState {
    return this.state();
  }

  set(state: EndfieldState): void {
    for (const owner of state.checkedDerived) assertOwner(owner);
    for (const id of Object.keys(state.resourceRecipeSettings))
      assertResource(id);
    this._state.set(immutableValue(state));
  }

  reset(): void {
    this.set(this.defaults);
  }

  updateRecipeField<K extends keyof RecipeState>(
    id: ResourceId,
    field: K,
    value: RecipeState[K],
    def?: RecipeState[K],
  ): void {
    assertResource(id);
    const settings: RecipeState = {
      ...this.state().resourceRecipeSettings[id],
    } as RecipeState;
    const matches =
      def != null && value instanceof Rational && def instanceof Rational
        ? value.eq(def)
        : Array.isArray(value) && Array.isArray(def)
          ? value.length === def.length && value.every((v, i) => v === def[i])
          : def != null && value === def;
    if (value == null || matches) delete settings[field];
    else settings[field] = value;
    if (field === 'machineId') {
      delete settings.modules;
      delete settings.fuelId;
      delete settings.beacons;
    }
    const next = { ...this.state().resourceRecipeSettings };
    if (Object.keys(settings).length) next[id] = settings;
    else delete next[id];
    this.set({ ...this.state(), resourceRecipeSettings: next });
  }

  resetRecipe(id: ResourceId): void {
    assertResource(id);
    const next = { ...this.state().resourceRecipeSettings };
    delete next[id];
    this.set({ ...this.state(), resourceRecipeSettings: next });
  }

  toggleDerived(owner: string, checked: boolean): void {
    assertOwner(owner);
    const next = new Set(this.state().checkedDerived);
    if (checked) next.add(owner);
    else next.delete(owner);
    this.set({ ...this.state(), checkedDerived: next });
  }

  clearDerived(): void {
    this.set({ ...this.state(), checkedDerived: new Set() });
  }
}
