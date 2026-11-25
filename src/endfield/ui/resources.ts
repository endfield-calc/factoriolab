import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import { AccordionModule } from '~/components/accordion/accordion-module';
import { Button } from '~/components/button/button';
import { Checkbox } from '~/components/checkbox/checkbox';
import { FormField } from '~/components/form-field/form-field';
import { InputNumber } from '~/components/input-number/input-number';
import { Select } from '~/components/select/select';
import { Rational, rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { TranslatePipe } from '~/translate/translate-pipe';
import { updateSetIds } from '~/utils/set';

import {
  EndfieldDomain,
  EndfieldName,
  EndfieldSettlement,
  settlementActivityBonus,
} from '../domain/game-data';
import {
  createEndfieldState,
  ovenId,
  ResourceId,
  resourceIds,
} from '../domain/model';
import { transferSourceOptions } from '../domain/transfer';
import { EndfieldStore } from '../state/endfield-store';

const waterRecipeIds = ['sewage-treat', 'sewage-treat-export'];

@Component({
  selector: 'lab-endfield-resources',
  imports: [
    AccordionModule,
    Button,
    Checkbox,
    FormField,
    InputNumber,
    Select,
    TranslatePipe,
  ],
  templateUrl: './resources.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class EndfieldResources {
  protected readonly store = inject(EndfieldStore);
  protected readonly settingsStore = inject(SettingsStore);
  protected readonly preferences = inject(PreferencesStore);
  protected readonly resources = resourceIds;
  protected readonly ovenId = ovenId;
  protected readonly regions = computed(
    () => this.settingsStore.endfieldData()?.domains ?? [],
  );
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
  protected readonly transferSources = computed(() =>
    transferSourceOptions(
      this.settingsStore.transferData(),
      this.settingsStore.settings().locationIds,
    ).map((source) => ({
      value: source.locationId,
      label:
        this.settingsStore.dataset().locationRecord[source.locationId]?.name ??
        source.locationId,
    })),
  );
  protected readonly transferSourceAvailable = computed(() =>
    this.transferSources().some(
      (source) => source.value === this.store.state().transferSource,
    ),
  );

  protected resourceName(id: string): string {
    return this.settingsStore.dataset().itemRecord[id]?.name ?? id;
  }

  protected localized(names: EndfieldName): string {
    const language = this.preferences.language();
    return language === 'zh' || language === 'ja' || language === 'ru'
      ? names[language]
      : names.en;
  }

  protected activeBonuses(
    settlement: EndfieldSettlement,
  ): { name: string; rate: number }[] {
    const times = this.settingsStore.activityTimes();
    return settlement.activities.flatMap((activity) => {
      const rate = settlementActivityBonus(activity, times);
      return rate === 0
        ? []
        : [{ name: this.localized(activity.activityName), rate }];
    });
  }

  protected settlementCouponRate(settlement: EndfieldSettlement): Rational {
    const level = settlement.levels.at(-1);
    if (level == null) return rational.zero;
    const bonus = this.activeBonuses(settlement).reduce(
      (sum, activity) => sum.add(rational(activity.rate)),
      rational(level.towerDefenseRate).add(
        rational(settlement.operatorBonusRate),
      ),
    );
    return rational(level.baseMoneySpeed)
      .mul(rational(100).add(bonus))
      .div(rational(100));
  }

  protected regionCouponRate(region: EndfieldDomain): Rational {
    return region.settlements.reduce(
      (sum, settlement) => sum.add(this.settlementCouponRate(settlement)),
      rational.zero,
    );
  }

  protected presetRegion(
    preset: 'tundra' | 'jinlong',
  ): EndfieldDomain | undefined {
    return this.regions().find(
      (region) =>
        region.locationId === preset &&
        region.mineSummary.some((mine) =>
          resourceIds.some((id) => id === mine.itemId),
        ),
    );
  }

  protected applyPreset(preset: 'tundra' | 'jinlong'): void {
    const region = this.presetRegion(preset);
    if (!region) return;
    const state = this.store.state();
    const settings = this.settingsStore.settings();
    const defaults = createEndfieldState();
    const rates = { ...defaults.resourceLimits.rates };
    for (const mine of region.mineSummary) {
      const id = resourceIds.find((value) => value === mine.itemId);
      if (id != null)
        rates[id] = rational(mine.outputPerMinute).div(rational(60));
    }
    const jinlong = preset === 'jinlong';
    const next = {
      ...defaults,
      electric: state.electric,
      activityModes: state.activityModes,
      resourceLimits: { enabled: true, rates },
      machineLimits: {
        enabled: jinlong,
        limits: {
          [ovenId]:
            region.machineLimits?.[ovenId] == null
              ? defaults.machineLimits.limits[ovenId]
              : rational(region.machineLimits[ovenId]),
        },
      },
      transferEnabled: jinlong,
    };
    const patch = {
      locationIds: new Set([preset]),
      ...(jinlong
        ? {
            excludedRecipeIds: updateSetIds(
              waterRecipeIds,
              false,
              settings.excludedRecipeIds,
            ),
          }
        : {}),
    };
    this.store.set(next);
    this.settingsStore.apply(patch);
  }

  protected clear(): void {
    const state = this.store.state();
    const settings = this.settingsStore.settings();
    const next = {
      ...createEndfieldState(),
      electric: state.electric,
      activityModes: state.activityModes,
    };
    const patch = {
      locationIds: new Set(settings.defaultLocationIds),
      excludedRecipeIds: updateSetIds(
        waterRecipeIds,
        false,
        settings.excludedRecipeIds,
      ),
    };
    this.store.set(next);
    this.settingsStore.apply(patch);
  }

  protected setResourceEnabled(enabled: boolean): void {
    const state = this.store.state();
    this.store.apply({
      resourceLimits: { ...state.resourceLimits, enabled },
    });
  }

  protected updateRate(id: ResourceId, value: Rational): void {
    const state = this.store.state();
    this.store.apply({
      resourceLimits: {
        ...state.resourceLimits,
        rates: { ...state.resourceLimits.rates, [id]: value.div(rational(60)) },
      },
    });
  }

  protected setMachineEnabled(enabled: boolean): void {
    const state = this.store.state();
    this.store.apply({
      machineLimits: { ...state.machineLimits, enabled },
    });
  }

  protected updateMachineLimit(value: Rational): void {
    const state = this.store.state();
    this.store.apply({
      machineLimits: {
        ...state.machineLimits,
        limits: { ...state.machineLimits.limits, [ovenId]: value },
      },
    });
  }

  protected setTransferEnabled(enabled: boolean): void {
    const state = this.store.state();
    this.store.set({ ...state, transferEnabled: enabled });
  }

  protected setTransferSource(source: string | undefined): void {
    if (
      source != null &&
      this.transferSources().some((option) => option.value === source)
    )
      this.store.apply({ transferSource: source });
  }

  protected setWaterDisabled(disabled: boolean): void {
    const excludedRecipeIds = updateSetIds(
      waterRecipeIds,
      disabled,
      this.settingsStore.settings().excludedRecipeIds,
    );
    this.settingsStore.apply({ excludedRecipeIds });
  }
}
