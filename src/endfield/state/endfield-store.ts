import { computed, Service } from '@angular/core';

import {
  createEndfieldState,
  EndfieldState,
  ResourceId,
  SourceRecipeSettings,
} from '~/endfield/domain/model';
import { Store } from '~/state/store';

/** Independent resource state; ordinary objectives and settings remain upstream. */
@Service()
export class EndfieldStore extends Store<EndfieldState> {
  readonly activityModes = this.select('activityModes');
  constructor() {
    super(createEndfieldState());
  }

  readonly electric = computed(() => this.state().electric, {
    equal: (a, b) => a.eq(b),
  });

  updateResourceRecipeField<K extends keyof SourceRecipeSettings>(
    id: ResourceId,
    field: K,
    value: SourceRecipeSettings[K],
    def?: SourceRecipeSettings[K],
  ): void {
    const settings = {
      ...this.state().resourceRecipeSettings[id],
    };
    const override = this._resetValue(value, def);
    if (override == null) delete settings[field];
    else settings[field] = override;
    const next = { ...this.state().resourceRecipeSettings };
    if (Object.keys(settings).length) next[id] = settings;
    else delete next[id];
    this.apply({ resourceRecipeSettings: next });
  }

  resetResourceRecipe(id: ResourceId): void {
    const next = { ...this.state().resourceRecipeSettings };
    delete next[id];
    this.apply({ resourceRecipeSettings: next });
  }

  resetResourceRecipes(): void {
    this.apply({ resourceRecipeSettings: {} });
  }

  setResourceChecked(id: ResourceId, checked: boolean): void {
    const next = new Set(this.state().checkedDerived);
    if (checked) next.add(id);
    else next.delete(id);
    this.apply({ checkedDerived: next });
  }

  clearResourceChecked(): void {
    this.apply({ checkedDerived: new Set() });
  }
}
