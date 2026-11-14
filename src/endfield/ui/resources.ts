import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { saveAs } from 'file-saver';

import { AccordionModule } from '~/components/accordion/accordion-module';
import { Button } from '~/components/button/button';
import { Checkbox } from '~/components/checkbox/checkbox';
import { FormField } from '~/components/form-field/form-field';
import { InputNumber } from '~/components/input-number/input-number';
import { Rational, rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { WorkspaceLifecycle } from '~/state/workspace-lifecycle';
import { TranslatePipe } from '~/translate/translate-pipe';

import {
  createEndfieldState,
  ovenId,
  ResourceId,
  resourceIds,
} from '../domain/model';
import { EndfieldStore } from '../state/endfield-store';

const waterRecipeIds = ['sewage-treat', 'sewage-treat-export'] as const;
const presetRates: Record<'tundra' | 'jinlong', Record<ResourceId, number>> = {
  tundra: {
    originium_ore: 560,
    quartz_sand: 240,
    iron_ore: 1080,
    copper_ore: 0,
    gas_xiranite: 0,
    gas_inert: 0,
  },
  jinlong: {
    originium_ore: 540,
    quartz_sand: 0,
    iron_ore: 120,
    copper_ore: 510,
    gas_xiranite: 150,
    gas_inert: 460,
  },
};

function waterExclusions(
  original: ReadonlySet<string>,
  disabled: boolean,
): Set<string> {
  const excluded = new Set(original);
  for (const id of waterRecipeIds) {
    if (disabled) excluded.add(id);
    else excluded.delete(id);
  }
  return excluded;
}

@Component({
  selector: 'lab-endfield-resources',
  imports: [
    RouterLink,
    AccordionModule,
    Button,
    Checkbox,
    FormField,
    InputNumber,
    TranslatePipe,
  ],
  templateUrl: './resources.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class EndfieldResources {
  protected readonly store = inject(EndfieldStore);
  protected readonly settingsStore = inject(SettingsStore);
  protected readonly lifecycle = inject(WorkspaceLifecycle);
  protected readonly preferences = inject(PreferencesStore);
  protected readonly resources = resourceIds;
  protected readonly ovenId = ovenId;
  /** The resource model stores physical rates per second; the editor uses per minute. */
  protected readonly ratesPerMinute = computed(() => {
    const rates = this.store.state().resourceLimits.rates;
    return Object.fromEntries(
      resourceIds.map((id) => [id, rates[id].mul(rational(60))] as const),
    ) as Record<ResourceId, Rational>;
  });
  protected readonly waterDisabled = computed(() =>
    waterRecipeIds.every((id) =>
      this.settingsStore.settings().excludedRecipeIds.has(id),
    ),
  );
  protected readonly onlyTundra = computed(() => {
    const locations = this.settingsStore.settings().locationIds;
    return locations.size === 1 && locations.has('tundra');
  });

  protected resourceName(id: string): string {
    return this.settingsStore.dataset().itemRecord[id]?.name ?? id;
  }

  protected applyPreset(preset: 'tundra' | 'jinlong'): void {
    if (!this.lifecycle.ready()) return;
    const state = this.store.state();
    const settings = this.settingsStore.settings();
    const defaults = createEndfieldState();
    const rates = { ...defaults.resourceLimits.rates };
    for (const id of resourceIds)
      rates[id] = rational(presetRates[preset][id], 60);
    const jinlong = preset === 'jinlong';
    const next = {
      ...defaults,
      electric: state.electric,
      resourceLimits: { enabled: true, rates },
      machineLimits: { enabled: jinlong, limits: { [ovenId]: rational(12) } },
      transfer: { enabled: jinlong, source: 'tundra' as const },
    };
    const patch = {
      locationIds: new Set([preset]),
      ...(jinlong
        ? {
            excludedRecipeIds: waterExclusions(
              settings.excludedRecipeIds,
              false,
            ),
          }
        : {}),
    };
    this.store.set(next);
    this.settingsStore.apply(patch);
  }

  protected clear(): void {
    if (!this.lifecycle.ready()) return;
    const state = this.store.state();
    const settings = this.settingsStore.settings();
    const next = { ...createEndfieldState(), electric: state.electric };
    const patch = {
      locationIds: new Set(settings.defaultLocationIds),
      excludedRecipeIds: waterExclusions(settings.excludedRecipeIds, false),
    };
    this.store.set(next);
    this.settingsStore.apply(patch);
  }

  protected setResourceEnabled(enabled: boolean): void {
    if (!this.lifecycle.ready()) return;
    const state = this.store.state();
    this.store.set({
      ...state,
      resourceLimits: { ...state.resourceLimits, enabled },
    });
  }

  protected updateRate(id: ResourceId, value: Rational | undefined): void {
    if (!this.lifecycle.ready() || value == null || value.lt(rational.zero))
      return;
    const state = this.store.state();
    this.store.set({
      ...state,
      resourceLimits: {
        ...state.resourceLimits,
        rates: { ...state.resourceLimits.rates, [id]: value.div(rational(60)) },
      },
    });
  }

  protected setMachineEnabled(enabled: boolean): void {
    if (!this.lifecycle.ready()) return;
    const state = this.store.state();
    this.store.set({
      ...state,
      machineLimits: { ...state.machineLimits, enabled },
    });
  }

  protected updateMachineLimit(value: Rational | undefined): void {
    if (!this.lifecycle.ready() || value == null || value.lt(rational.zero))
      return;
    const state = this.store.state();
    this.store.set({
      ...state,
      machineLimits: {
        ...state.machineLimits,
        limits: { ...state.machineLimits.limits, [ovenId]: value },
      },
    });
  }

  protected setTransferEnabled(enabled: boolean): void {
    if (!this.lifecycle.ready()) return;
    const state = this.store.state();
    this.store.set({ ...state, transfer: { enabled, source: 'tundra' } });
  }

  protected setWaterDisabled(disabled: boolean): void {
    if (!this.lifecycle.ready()) return;
    const excludedRecipeIds = waterExclusions(
      this.settingsStore.settings().excludedRecipeIds,
      disabled,
    );
    this.settingsStore.apply({ excludedRecipeIds });
  }

  protected download(name: string, value: string): void {
    saveAs(new Blob([value], { type: 'text/plain;charset=utf-8' }), name);
  }
}
