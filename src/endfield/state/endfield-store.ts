import { computed, Service, signal } from '@angular/core';

import {
  createEndfieldState,
  EndfieldState,
  ResourceId,
  resourceIds,
  resourceOwner,
  SourceRecipeSettings,
} from '~/endfield/domain/model';
import { Rational } from '~/rational/rational';

function assertResource(id: string): asserts id is ResourceId {
  if (!resourceIds.some((resource) => resource === id))
    throw new Error(`Unknown resource ID: ${id}`);
}

function assertOwner(owner: string): void {
  if (!resourceIds.some((id) => resourceOwner(id) === owner))
    throw new Error(`Unknown derived owner: ${owner}`);
}

/** Independent resource state; ordinary objectives and settings remain upstream. */
@Service()
export class EndfieldStore {
  private readonly _state = signal<EndfieldState>(createEndfieldState());
  readonly state = this._state.asReadonly();
  readonly electric = computed(() => this.state().electric);

  snapshot(): EndfieldState {
    return this.state();
  }

  set(state: EndfieldState): void {
    for (const owner of state.checkedDerived) assertOwner(owner);
    const resourceRecipeSettings: Partial<
      Record<ResourceId, SourceRecipeSettings>
    > = {};
    for (const [id, settings] of Object.entries(state.resourceRecipeSettings)) {
      assertResource(id);
      if (settings == null) continue;
      const { machineId, overclock } = settings;
      if (machineId != null || overclock != null)
        resourceRecipeSettings[id] = {
          ...(machineId == null ? {} : { machineId }),
          ...(overclock == null ? {} : { overclock }),
        };
    }
    this._state.set({
      ...state,
      resourceLimits: {
        ...state.resourceLimits,
        rates: { ...state.resourceLimits.rates },
      },
      machineLimits: {
        ...state.machineLimits,
        limits: { ...state.machineLimits.limits },
      },
      transfer: { ...state.transfer },
      resourceRecipeSettings,
      checkedDerived: new Set(state.checkedDerived),
    });
  }

  reset(): void {
    this.set(createEndfieldState());
  }

  updateResourceRecipeField<K extends keyof SourceRecipeSettings>(
    id: ResourceId,
    field: K,
    value: SourceRecipeSettings[K],
    def?: SourceRecipeSettings[K],
  ): void {
    assertResource(id);
    if (field !== 'machineId' && field !== 'overclock')
      throw new Error(`Unknown source recipe setting: ${String(field)}`);
    const settings: { machineId?: string; overclock?: Rational } = {
      ...this.state().resourceRecipeSettings[id],
    };
    const matches =
      def != null && value instanceof Rational && def instanceof Rational
        ? value.eq(def)
        : def != null && value === def;
    if (value == null || matches) delete settings[field];
    else settings[field] = value;
    const next = { ...this.state().resourceRecipeSettings };
    if (Object.keys(settings).length) next[id] = settings;
    else delete next[id];
    this.set({ ...this.state(), resourceRecipeSettings: next });
  }

  resetResourceRecipe(id: ResourceId): void {
    assertResource(id);
    const next = { ...this.state().resourceRecipeSettings };
    delete next[id];
    this.set({ ...this.state(), resourceRecipeSettings: next });
  }

  resetResourceRecipes(): void {
    this.set({ ...this.state(), resourceRecipeSettings: {} });
  }

  setResourceChecked(id: ResourceId, checked: boolean): void {
    assertResource(id);
    const owner = resourceOwner(id);
    const next = new Set(this.state().checkedDerived);
    if (checked) next.add(owner);
    else next.delete(owner);
    this.set({ ...this.state(), checkedDerived: next });
  }

  clearResourceChecked(): void {
    this.set({ ...this.state(), checkedDerived: new Set() });
  }
}
