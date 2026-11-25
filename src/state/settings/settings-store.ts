import { httpResource } from '@angular/common/http';
import { computed, effect, inject, Service } from '@angular/core';
import { faDatabase } from '@fortawesome/free-solid-svg-icons';

import { DEFAULT_MOD, modRecord } from '~/data/datasets';
import { Game } from '~/data/game';
import { gameInfo } from '~/data/game-info';
import { IconType } from '~/data/icon-type';
import { ModInfo } from '~/data/mod';
import { Beacon, parseBeacon } from '~/data/schema/beacon';
import { Belt, parseBelt, PIPE } from '~/data/schema/belt';
import { Category } from '~/data/schema/category';
import { Fuel } from '~/data/schema/fuel';
import {
  IconBase,
  IconData,
  parseIcon,
  parseIconData,
} from '~/data/schema/icon-data';
import { Inserter, parseInserter } from '~/data/schema/inserter';
import { Item, itemHasQuality, ItemJson, parseItem } from '~/data/schema/item';
import { Machine, parseMachine } from '~/data/schema/machine';
import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
import { ModI18n } from '~/data/schema/mod-i18n';
import { Module, parseModule } from '~/data/schema/module';
import { baseId, Quality, qualityId } from '~/data/schema/quality';
import { parseRecipe, Recipe, recipeHasQuality } from '~/data/schema/recipe';
import { Technology } from '~/data/schema/technology';
import { Wagon } from '~/data/schema/wagon';
import {
  ActivityMode,
  ActivityModes,
  availableEndfieldData,
  scheduledActivityStage,
} from '~/endfield/domain/game-data';
import { EndfieldTransferData } from '~/endfield/domain/transfer';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { LinkOption } from '~/option/link-option';
import { getIdOptions, Option, OptionParams } from '~/option/option';
import { Rational, rational } from '~/rational/rational';
import { log } from '~/utils/log';
import { coalesce, fnPropsNotNullish } from '~/utils/nullish';
import { spread } from '~/utils/object';
import {
  reduceRecord,
  toRationalRecord,
  toRecord,
  toRecordEntries,
} from '~/utils/record';

import { BeaconSettings } from '../beacon-settings';
import { Hydration } from '../hydration';
import { ModuleSettings } from '../module-settings';
import { objectiveUnitOptions } from '../objectives/objective-unit';
import { columnOptions, gameColumnsState } from '../preferences/columns-state';
import { linkValueOptions } from '../preferences/link-value';
import { PreferencesStore } from '../preferences/preferences-store';
import { Store } from '../store';
import { Dataset } from './dataset';
import { Defaults } from './defaults';
import { displayRateInfo } from './display-rate';
import { Options } from './options';
import { presetOptions } from './preset';
import { Settings } from './settings';
import { initialSettingsState, SettingsState } from './settings-state';
import { systemIconsRecord } from './system-icons';

@Service()
export class SettingsStore extends Store<SettingsState> {
  private readonly hydration = inject(Hydration);
  private readonly preferencesStore = inject(PreferencesStore);
  private readonly endfieldStore = inject(EndfieldStore);
  readonly modId = this.select('modId');
  readonly maximizeType = this.select('maximizeType');
  readonly displayRate = this.select('displayRate');
  readonly flowRate = this.select('flowRate');
  readonly preset = this.select('preset');
  readonly researchedTechnologyIds = this.select('researchedTechnologyIds');

  private readonly modDataResource = httpResource<ModData>(() => {
    const modId = this.modId();
    if (modId == null) return undefined;
    return `data/${modId}/data.json`;
  });

  private readonly transferResource = httpResource<EndfieldTransferData>(() =>
    this.modId() === 'aef' ? 'data/aef/transfer.json' : undefined,
  );
  readonly transferData = computed(() =>
    this.transferResource.error() ? undefined : this.transferResource.value(),
  );
  readonly transferError = computed(() => this.transferResource.error());

  private readonly modHashResource = httpResource<ModHash>(() => {
    const modId = this.modId();
    if (modId == null) return undefined;
    return `data/${modId}/hash.json`;
  });

  private readonly modI18nResource = httpResource<ModI18n>(() => {
    const modId = this.modId();
    const lang = this.preferencesStore.language();
    if (modId == null || !['zh', 'ja', 'ru'].includes(lang)) return undefined;
    return `data/${modId}/i18n/${lang}.json`;
  });

  readonly loading = computed(
    () =>
      this.modDataResource.isLoading() ||
      this.modHashResource.isLoading() ||
      this.modI18nResource.isLoading(),
  );

  readonly modData = computed(() => {
    const modId = this.modId();
    if (modId == null) return undefined;

    if (this.modDataResource.error()) return undefined;
    return this.modDataResource.value();
  });

  readonly modHash = computed(() => {
    const modId = this.modId();
    if (modId == null) return undefined;

    if (this.modHashResource.error()) return undefined;
    return this.modHashResource.value();
  });

  readonly endfieldData = computed(() => this.modData()?.endfield);
  // Auto uses the server schedule when the catalog loads or is replaced.
  readonly activitySchedule = computed(() => {
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(this.endfieldData()?.activities ?? {}).map(
        ([id, event]) => [id, scheduledActivityStage(event, now)],
      ),
    );
  });
  readonly activityModes = computed<ActivityModes>(() => {
    const saved = this.endfieldStore.activityModes();
    return Object.fromEntries(
      Object.entries(this.endfieldData()?.activities ?? {}).flatMap(
        ([id, event]) => {
          const mode = saved[id];
          return mode === 'disabled' ||
            (mode != null && event.stageStarts.includes(mode))
            ? [[id, mode]]
            : [];
        },
      ),
    );
  });
  readonly activityTimes = computed(() => {
    const modes = this.activityModes();
    return Object.fromEntries(
      Object.entries(this.activitySchedule()).map(([id, scheduled]) => {
        const stage = modes[id] ?? scheduled;
        return [id, typeof stage === 'number' ? stage : -Infinity];
      }),
    );
  });

  setActivityMode(id: string, mode: ActivityMode): void {
    const modes = { ...this.endfieldStore.activityModes() };
    if (mode === 'auto') delete modes[id];
    else modes[id] = mode;
    this.endfieldStore.apply({ activityModes: modes });
  }
  private readonly availableModData = computed(() => {
    const data = this.modData();
    return data?.endfield
      ? availableEndfieldData(data, this.activityTimes())
      : data;
  });

  readonly modI18n = computed(() => {
    if (this.modI18nResource.error()) return undefined;
    return this.modI18nResource.value();
  });

  readonly modInfo = computed(() => {
    const modId = this.modId();
    if (modId == null) return undefined;
    return modRecord[modId];
  });

  readonly game = computed(() => {
    const mod = this.modInfo();
    return coalesce<Game>(mod?.game, 'endfield');
  });

  readonly modStates = computed(() => {
    const modId = this.modId();
    if (modId == null) return {};
    const states = this.preferencesStore.states();
    return coalesce(states[modId], {});
  });

  readonly stateOptions = computed(() => {
    const states = this.modStates();
    return Object.keys(states)
      .sort()
      .map((i): Option => ({ label: i, value: i }));
  });

  readonly gameInfo = computed(() => {
    const game = this.game();
    return gameInfo[game];
  });

  readonly displayRateInfo = computed(() => {
    const displayRate = this.displayRate();
    return displayRateInfo[displayRate];
  });

  readonly defaults = computed(() =>
    this.computeDefaults(this.modData(), this.preset()),
  );

  readonly iconPath = computed(() => {
    const info = this.modInfo();
    const modId = coalesce(info?.id, DEFAULT_MOD);
    return `data/${modId}/icons.webp`;
  });

  readonly dataset = computed(() =>
    this.computeDataset(
      this.modInfo(),
      this.availableModData(),
      this.modHash(),
      this.modI18n(),
      this.game(),
    ),
  );

  readonly linkValueOptions = computed(() => {
    const data = this.dataset();
    return linkValueOptions(data);
  });

  readonly objectiveUnitOptions = computed(() => {
    const dispRateInfo = this.displayRateInfo();
    const data = this.dataset();
    return objectiveUnitOptions(dispRateInfo, data);
  });

  readonly presetOptions = computed(() => {
    const modData = this.modData();
    const data = this.dataset();
    return presetOptions(data, modData?.defaults);
  });

  readonly columnOptions = computed(() => {
    const data = this.dataset();
    return columnOptions(data);
  });

  readonly columnsState = computed(() => {
    const data = this.dataset();
    const columns = this.preferencesStore.columns();
    return gameColumnsState(columns, data);
  });

  readonly settings = computed(() =>
    this.computeSettings(this.state(), this.defaults(), this.dataset()),
  );

  readonly options = computed((): Options => {
    const data = this.dataset();
    const settings = this.settings();
    const itemSet = new Set(settings.availableItemIds);

    function itemOptions(ids: string[], params?: OptionParams): Option[] {
      return getIdOptions(ids, data.itemRecord, {
        ...params,
        ...{ include: itemSet, iconType: 'item' },
      });
    }

    return {
      categories: getIdOptions(data.categoryIds, data.categoryRecord),
      beacons: itemOptions(data.beaconIds, { tooltipType: 'beacon' }),
      belts: itemOptions(data.beltIds, {
        /** Filter out quality belt items where belt is unaffected by quality */
        exclude: (itemId: string): boolean => {
          const item = data.itemRecord[itemId];
          return item.quality != null && item.belt?.quality == null;
        },
        tooltipType: 'belt',
      }),
      wagons: itemOptions(data.wagonIds, {
        /** Wagons are not currently affected by quality */
        exclude: (itemId: string): boolean =>
          data.itemRecord[itemId].quality != null,
        tooltipType: 'wagon',
      }),
      inserters: itemOptions(data.inserterIds, { tooltipType: 'inserter' }),
      fuels: itemOptions(data.fuelIds, {
        /** Fuels are not currently affected by quality */
        exclude: (itemId: string): boolean =>
          data.itemRecord[itemId].quality != null,
        tooltipType: 'fuel',
      }),
      modules: itemOptions(data.moduleIds, { tooltipType: 'module' }),
      proliferatorModules: itemOptions(data.proliferatorModuleIds, {
        emptyOption: {
          label: 'none',
          value: '',
          icon: 'module',
        },
        include: itemSet,
        tooltipType: 'module',
      }),
      machines: itemOptions(data.machineIds, { tooltipType: 'machine' }),
      locations: getIdOptions(data.locationIds, data.locationRecord, {
        iconType: 'location',
      }),
      qualities: getIdOptions(data.qualityIds, data.qualityRecord, {
        iconType: 'quality',
        emptyOption: {
          label: 'any',
          value: '',
          icon: 'q-any',
          iconType: 'system',
        },
      }),
    };
  });

  readonly beltSpeed = computed(() => {
    const data = this.dataset();
    const flowRate = this.flowRate();

    const value: Record<string, Rational> = { [PIPE]: flowRate };
    if (data.beltIds) {
      for (const id of data.beltIds) value[id] = data.beltRecord[id].speed;
    }

    return value;
  });

  readonly beltSpeedTxt = computed(() => {
    const beltSpeed = this.beltSpeed();
    const dispRateInfo = this.displayRateInfo();

    return Object.keys(beltSpeed).reduce(
      (e: Record<string, string>, beltId) => {
        const speed = beltSpeed[beltId].mul(dispRateInfo.value);
        e[beltId] = Number(speed.toNumber().toFixed(2)).toString();
        return e;
      },
      {},
    );
  });

  readonly modMenuItem = computed((): LinkOption => {
    const mod = this.modInfo();

    return {
      faIcon: faDatabase,
      routerLink: `/${coalesce(mod?.id, DEFAULT_MOD)}/data`,
      label: coalesce(mod?.name, ''),
    };
  });

  constructor() {
    super(initialSettingsState, ['costs']);

    effect(() => {
      const modId = this.modId();
      if (modId) log('set_mod_id', modId);
    });

    effect(() => {
      const mod = this.modInfo();
      if (mod) log('set_game', mod.game);
    });
  }

  private computeDefaults(
    modData: ModData | undefined,
    presetSetting: number,
  ): Defaults | undefined {
    if (modData?.defaults == null || !('presets' in modData.defaults))
      return undefined;

    const m = modData.defaults;
    const p = coalesce(
      m.presets.find((p) => p.id === presetSetting),
      coalesce(m.presets[0], { id: 0, label: '' }),
    );
    let beacons: BeaconSettings[] = [];
    const beaconId = coalesce(p.beacon, m.beacon);
    if (beaconId) {
      const beaconBaseId = baseId(beaconId);
      const beacon = modData.items.find((i) => i.id === beaconBaseId)?.beacon;
      if (beacon) {
        const modules: ModuleSettings[] = [
          {
            count: rational(beacon.modules),
            id: coalesce(coalesce(p.beaconModule, m.beaconModule), ''),
          },
        ];
        beacons = [
          {
            count: rational(coalesce(p.beaconCount, 0)),
            id: beaconId,
            modules,
          },
        ];
      }
    }

    return {
      locations: coalesce(p.locations, m.locations),
      beltRankIds: coalesce(p.beltRank, m.beltRank),
      beltStack: rational(coalesce(p.beltStack, m.beltStack)),
      fuelRankIds: coalesce(coalesce(p.fuelRank, m.fuelRank), []),
      wagonRankIds: coalesce(p.wagonRank, m.wagonRank),
      excludedRecipeIds: coalesce(
        coalesce(p.excludedRecipes, m.excludedRecipes),
        [],
      ),
      machineRankIds: coalesce(coalesce(p.machineRank, m.machineRank), []),
      moduleRankIds: coalesce(coalesce(p.moduleRank, m.moduleRank), []),
      beacons,
      miningBonus: rational(coalesce(p.miningBonus, m.miningBonus)),
      researchBonus: rational(coalesce(p.researchBonus, m.researchBonus)),
      researchProductivity: rational(
        coalesce(p.researchProductivity, m.researchProductivity),
      ),
      researchedTechnologyIds: p.researchedTechnologies
        ? new Set(p.researchedTechnologies)
        : undefined,
      recipeProductivity: toRationalRecord(p.recipeProductivity),
    };
  }

  private computeDataset(
    info: ModInfo | undefined,
    data: ModData | undefined,
    hash: ModHash | undefined,
    i18n: ModI18n | undefined,
    game: Game,
  ): Dataset {
    // Map out records with mods
    const categoryRecord = toRecord(coalesce(data?.categories, []));
    const iconData = toRecord(
      coalesce(data?.icons, []).map((i) => parseIcon(i)),
    );
    const itemData = toRecord(coalesce(data?.items, []));
    const recipeData = toRecord(coalesce(data?.recipes, []));
    const limitations = reduceRecord(coalesce(data?.limitations, {}));
    const locationRecord = toRecord(coalesce(data?.locations, []));
    const qualityRecord = toRecord(coalesce(data?.qualities, []));

    // Apply localization
    if (i18n) {
      for (const i of Object.keys(i18n.categories).filter(
        (i) => categoryRecord[i],
      )) {
        categoryRecord[i] = spread(categoryRecord[i], {
          name: i18n.categories[i],
        });
      }

      for (const i of Object.keys(i18n.items).filter((i) => itemData[i]))
        itemData[i] = spread(itemData[i], { name: i18n.items[i] });

      for (const i of Object.keys(i18n.recipes).filter((i) => recipeData[i]))
        recipeData[i] = spread(recipeData[i], { name: i18n.recipes[i] });

      if (i18n.locations) {
        for (const i of Object.keys(i18n.locations).filter(
          (i) => locationRecord[i],
        )) {
          locationRecord[i] = spread(locationRecord[i], {
            name: i18n.locations[i],
          });
        }
      }

      if (i18n.qualities) {
        for (const i of Object.keys(i18n.qualities).filter(
          (i) => qualityRecord[i],
        )) {
          qualityRecord[i] = spread(qualityRecord[i], {
            name: i18n.qualities[i],
          });
        }
      }
    }

    // Convert to id arrays
    const categoryIds = Object.keys(categoryRecord);
    const iconIds = Object.keys(iconData);
    const itemIds = Object.keys(itemData);
    const recipeIds = Object.keys(recipeData);
    const locationIds = Object.keys(locationRecord);
    const qualityIds = Object.keys(qualityRecord).sort(
      (a, b) => qualityRecord[a].level - qualityRecord[b].level,
    );

    // Generate temporary object arrays
    const items = itemIds.map((i) => parseItem(itemData[i]));
    const recipes = recipeIds.map((r) => parseRecipe(recipeData[r]));

    // Calculate missing implicit recipe icons
    // For recipes with no icon, use icon of first output item
    recipes
      .filter((r) => !iconData[r.id] && !r.icon)
      .forEach((r) => {
        const firstOutId = Object.keys(r.out)[0];
        const firstOutItem = itemData[firstOutId];
        r.icon = firstOutItem.icon ?? firstOutId;
      });

    const recipeQIds = new Set<string>();
    const abnormalQualities = data?.qualities?.filter((q) => q.level) ?? [];
    if (abnormalQualities.length) {
      recipes.forEach((r) => {
        const producers = r.producers;
        if (producers == null) return;
        r.producers = [
          ...producers,
          ...abnormalQualities.flatMap((q) =>
            producers.map((p) => qualityId(p, q)),
          ),
        ];
      });
      const itemsLen = items.length;
      const recipesLen = recipes.length;
      abnormalQualities.forEach((quality) => {
        for (let i = 0; i < itemsLen; i++) {
          const item = items[i];
          if (!itemHasQuality(item)) continue;

          const itemJson = itemData[item.id];
          const id = qualityId(item.id, quality);
          itemIds.push(id);
          const qItem = spread(item, {
            id,
            quality,
            icon: coalesce(item.icon, item.id),
          });

          if (itemJson.beacon?.qualityRecord) {
            const qBeaconJson = itemJson.beacon.qualityRecord[quality.id];
            if (qBeaconJson)
              qItem.beacon = parseBeacon(spread(itemJson.beacon, qBeaconJson));
          }

          if (itemJson.belt?.qualityRecord) {
            const qBeltJson = itemJson.belt.qualityRecord[quality.id];
            if (qBeltJson)
              qItem.belt = parseBelt(spread(itemJson.belt, qBeltJson), quality);
          }

          if (itemJson.inserter?.qualityRecord) {
            const qInserterJson = itemJson.inserter.qualityRecord[quality.id];
            if (qInserterJson)
              qItem.inserter = parseInserter(
                spread(itemJson.inserter, qInserterJson),
              );
          }

          if (itemJson.machine?.qualityRecord) {
            const qMachineJson = itemJson.machine.qualityRecord[quality.id];
            if (qMachineJson)
              qItem.machine = parseMachine(
                spread(itemJson.machine, qMachineJson),
              );
          }

          if (itemJson.module?.qualityRecord) {
            const qModuleJson = itemJson.module.qualityRecord[quality.id];
            if (qModuleJson)
              qItem.module = parseModule(spread(itemJson.module, qModuleJson));
          }

          items.push(qItem);
        }

        for (let i = 0; i < recipesLen; i++) {
          const recipe = recipes[i];
          if (!recipeHasQuality(recipe, itemData)) continue;

          const id = qualityId(recipe.id, quality);
          recipeQIds.add(id);
          recipeIds.push(id);

          const qIn = this.qualityRecord(
            recipe.in,
            quality,
            itemData,
            recipe.flags.has('technology'),
          );
          const qOut =
            recipe.flags.has('technology') || recipe.flags.has('plant')
              ? recipe.out
              : this.qualityRecord(recipe.out, quality, itemData);
          let qCatalyst: Record<string, Rational> | undefined;
          if (recipe.catalyst)
            qCatalyst = this.qualityRecord(recipe.catalyst, quality, itemData);

          recipes.push(
            spread(recipe, {
              id,
              in: qIn,
              out: qOut,
              catalyst: qCatalyst,
              quality,
              icon: coalesce(recipe.icon, recipe.id),
            }),
          );
        }
      });
    }

    // Filter for item types
    const beaconIds = items
      .filter(fnPropsNotNullish('beacon'))
      .sort(
        (a, b) =>
          (a.quality?.level ?? 0) - (b.quality?.level ?? 0) ||
          a.beacon.modules.sub(b.beacon.modules).toNumber(),
      )
      .map((i) => i.id);
    const beltIds = items
      .filter(fnPropsNotNullish('belt'))
      .sort(
        (a, b) =>
          (a.quality?.level ?? 0) - (b.quality?.level ?? 0) ||
          a.belt.speed.sub(b.belt.speed).toNumber(),
      )
      .map((i) => i.id);
    const wagonIds = items
      .filter(fnPropsNotNullish('wagon'))
      .sort((a, b) => (a.quality?.level ?? 0) - (b.quality?.level ?? 0))
      .map((i) => i.id);
    const machineIds = items
      .filter(fnPropsNotNullish('machine'))
      .sort((a, b) => (a.quality?.level ?? 0) - (b.quality?.level ?? 0))
      .map((i) => i.id);
    const modules = items.filter(fnPropsNotNullish('module'));
    const moduleIds = modules.map((i) => i.id);
    const proliferatorModuleIds = modules
      .filter((i) => i.module.sprays != null)
      .map((i) => i.id);
    const fuels = items
      .filter(fnPropsNotNullish('fuel'))
      .sort(
        (a, b) =>
          (a.quality?.level ?? 0) - (b.quality?.level ?? 0) ||
          a.fuel.value.sub(b.fuel.value).toNumber(),
      );
    const fuelIds = fuels.map((i) => i.id);
    const technologyIds = items
      .filter(fnPropsNotNullish('technology'))
      .map((r) => r.id);
    const inserterIds = items
      .filter(fnPropsNotNullish('inserter'))
      .map((i) => i.id);

    // Calculate category item rows
    const itemCategoryRows: Record<string, string[][]> = {};
    for (const id of categoryIds) {
      const rows: string[][] = [[]];
      const rowItems = items
        .filter((i) => i.category === id)
        .sort((a, b) => a.row - b.row);
      if (rowItems.length) {
        let index = rowItems[0].row;
        for (const item of rowItems) {
          if (item.row > index) {
            rows.push([]);
            index = item.row;
          }

          rows[rows.length - 1].push(item.id);
        }

        itemCategoryRows[id] = rows;
      }
    }

    // Calculate recipe item rows
    const recipeCategoryRows: Record<string, string[][]> = {};
    for (const id of categoryIds) {
      const rows: string[][] = [[]];
      const rowRecipes = recipes
        .filter((r) => r.category === id)
        .sort((a, b) => a.row - b.row);
      if (rowRecipes.length) {
        let index = rowRecipes[0].row;
        for (const recipe of rowRecipes) {
          if (recipe.row > index) {
            rows.push([]);
            index = recipe.row;
          }

          rows[rows.length - 1].push(recipe.id);
        }

        recipeCategoryRows[id] = rows;
      }
    }

    // Convert to rationals
    const beaconRecord: Record<string, Beacon> = {};
    const beltRecord: Record<string, Belt> = {};
    const wagonRecord: Record<string, Wagon> = {};
    const machineRecord: Record<string, Machine> = {};
    const moduleRecord: Record<string, Module> = {};
    const fuelRecord: Record<string, Fuel> = {};
    const technologyRecord: Record<string, Technology> = {};
    const inserterRecord: Record<string, Inserter> = {};
    const itemRecord = items.reduce((e: Record<string, Item>, i) => {
      if (i.beacon) beaconRecord[i.id] = i.beacon;
      if (i.belt) beltRecord[i.id] = i.belt;
      if (i.wagon) wagonRecord[i.id] = i.wagon;
      if (i.machine) machineRecord[i.id] = i.machine;
      if (i.module) moduleRecord[i.id] = i.module;
      if (i.fuel) fuelRecord[i.id] = i.fuel;
      if (i.technology) technologyRecord[i.id] = i.technology;
      if (i.inserter) inserterRecord[i.id] = i.inserter;

      e[i.id] = i;
      return e;
    }, {});
    const noRecipeItemIds = new Set(itemIds);
    const recipeRecord = recipes.reduce((e: Record<string, Recipe>, r) => {
      toRecordEntries(r.out).forEach(([i, val]) => {
        if ((r.in[i] ?? 0) < val) noRecipeItemIds.delete(i);
      });

      e[r.id] = r;
      return e;
    }, {});

    if (abnormalQualities.length) {
      for (const quality of abnormalQualities) {
        for (const techId in technologyRecord) {
          const tech = technologyRecord[techId];
          if (tech.recipeProductivity) {
            for (const effect of tech.recipeProductivity) {
              const id = qualityId(effect.id, quality);
              if (recipeQIds.has(id))
                tech.recipeProductivity.push({
                  id,
                  value: effect.value,
                });
            }
          }
        }
      }
    }

    const prodUpgradeTechIds = technologyIds.filter(
      (id) => technologyRecord[id].recipeProductivity,
    );

    const modId = coalesce(info?.id, DEFAULT_MOD);
    const file = `data/${modId}/icons.webp`;

    function toIconRecord(
      ids: string[],
      rec: Record<string, Category | Item | Recipe | IconBase>,
    ): Record<string, IconData> {
      return ids.reduce<Record<string, IconData>>((e, i) => {
        const entity = rec[i];
        const id = coalesce((entity as Category | Item | Recipe).icon, i);
        e[i] = parseIconData(iconData[id], file, entity);
        return e;
      }, {});
    }

    // Generate Icon Record
    const iconRecord: Record<
      Exclude<IconType, 'img'>,
      Record<string, IconData>
    > = {
      system: systemIconsRecord,
      game: toIconRecord(iconIds, iconData),
      category: toIconRecord(categoryIds, categoryRecord),
      item: toIconRecord(itemIds, itemRecord),
      recipe: toIconRecord(recipeIds, recipeRecord),
      location: toIconRecord(locationIds, locationRecord),
      quality: toIconRecord(qualityIds, qualityRecord),
    };

    return {
      game,
      modId: modId,
      info: gameInfo[game],
      flags: new Set(data?.flags),
      version: coalesce(data?.version, {}),
      categoryIds,
      categoryRecord,
      itemCategoryRows,
      recipeCategoryRows,
      iconIds,
      iconRecord,
      itemIds,
      itemRecord,
      noRecipeItemIds,
      beaconIds,
      beaconRecord,
      beltIds,
      beltRecord,
      wagonIds,
      wagonRecord,
      machineIds,
      machineRecord,
      moduleIds,
      proliferatorModuleIds,
      moduleRecord,
      fuelIds,
      fuelRecord,
      recipeIds,
      recipeQIds,
      recipeRecord,
      prodUpgradeTechIds,
      technologyIds,
      technologyRecord,
      inserterIds,
      inserterRecord,
      locationIds,
      locationRecord,
      qualityIds,
      qualityRecord,
      abnormalQualities,
      limitations,
      hash,
    };
  }

  private computeSettings(
    state: SettingsState,
    defaults: Defaults | undefined,
    data: Dataset,
  ): Settings {
    const techIds =
      state.researchedTechnologyIds ?? defaults?.researchedTechnologyIds;
    // Default: non-infinite technologies
    let researchedTechnologyIds = new Set(
      data.technologyIds.filter((i) => !data.technologyRecord[i].infinite),
    );
    if (techIds != null && researchedTechnologyIds.size > 0) {
      // Filter for only technologies that still exist in this data set
      const filteredTechs = Array.from(techIds).filter((i) =>
        researchedTechnologyIds.has(i),
      );
      researchedTechnologyIds = new Set(filteredTechs);
    }

    const locIds = state.locationIds;
    const defaultLocationIds = defaults?.locations ?? data.locationIds;
    let locationIds = new Set(defaultLocationIds);
    if (locIds != null && defaultLocationIds.length > 0) locationIds = locIds;

    let quality: Quality | undefined;
    let stack = rational.one;
    const inserterBonus: Partial<Record<string, Rational>> = {};
    let miningBonus = rational.zero;
    let researchBonus = rational.zero;
    let researchProductivity = rational.zero;
    researchedTechnologyIds.forEach((techId) => {
      const tech = data.technologyRecord[techId];
      if (tech.beltStack) stack = stack.add(tech.beltStack);

      if (tech.inserterStack) {
        tech.inserterStack.forEach((eff) => {
          const category = eff.category ?? '';
          inserterBonus[category] ??= rational.zero;
          inserterBonus[category] = inserterBonus[category].add(eff.value);
        });
      }

      if (tech.miningProductivity) {
        miningBonus = miningBonus.add(
          tech.miningProductivity.mul(rational(100n)),
        );
      }

      if (tech.qualityUnlock) {
        tech.qualityUnlock.forEach((q) => {
          const unlock = data.qualityRecord[q];
          if (quality == null || unlock.level > quality.level) quality = unlock;
        });
      }

      if (tech.researchSpeed) {
        researchBonus = researchBonus.add(
          tech.researchSpeed.mul(rational(100n)),
        );
      }

      if (tech.researchProductivity) {
        researchProductivity = researchProductivity.add(
          tech.researchProductivity.mul(rational(100n)),
        );
      }
    });

    if (defaults?.miningBonus?.gt(miningBonus))
      miningBonus = defaults.miningBonus;
    if (defaults?.researchBonus?.gt(researchBonus))
      researchBonus = defaults.researchBonus;
    if (defaults?.researchProductivity?.gt(researchProductivity))
      researchProductivity = defaults?.researchProductivity;

    // List of recipes that have been unlocked by technology
    const researchedRecipeIds = new Set(
      Array.from(researchedTechnologyIds).flatMap(
        (t) => data.technologyRecord[t].recipeUnlock,
      ),
    );
    const unlockedRecipes = data.recipeIds
      .map((r) => data.recipeRecord[r])
      .filter(
        (r) =>
          (!r.flags.has('locked') || researchedRecipeIds.has(baseId(r.id))) &&
          (r.quality == null || r.quality.level <= coalesce(quality?.level, 0)),
      );

    // Recipe productivity bonuses unlocked by technology
    const recipeBonus = Array.from(researchedTechnologyIds).reduce<
      Partial<Record<string, Rational>>
    >((result, b) => {
      const tech = data.technologyRecord[b];
      tech.recipeProductivity?.forEach((eff) => {
        result[eff.id] ??= rational.zero;
        result[eff.id] = result[eff.id]?.add(eff.value.mul(rational(100n)));
      });
      return result;
    }, {});

    if (defaults?.recipeProductivity) {
      for (const [recipeId, bonus] of toRecordEntries(
        defaults?.recipeProductivity,
      )) {
        if (bonus.gt(coalesce(recipeBonus[recipeId], rational.zero)))
          recipeBonus[recipeId] = bonus;
      }
    }

    // Initialize list of items with those that have no recipe
    const noRecipeQualItemIds = Array.from(data.noRecipeItemIds)
      .map((i) => data.itemRecord[i])
      .filter(
        (i) =>
          i.quality == null || i.quality.level <= coalesce(quality?.level, 0),
      )
      .map((i) => i.id);
    const availableItemIds = new Set(noRecipeQualItemIds);
    // Add all items that are produced by unlocked recipes
    unlockedRecipes.forEach((r) => {
      toRecordEntries(r.out).forEach(([i, val]) => {
        if ((r.in[i] ?? 0) < val) availableItemIds.add(i);
      });
    });

    // Limit available recipes based on locations and whether machines are available
    const availableRecipes = unlockedRecipes.filter(
      (r) =>
        (r.locations == null || r.locations.some((l) => locationIds.has(l))) &&
        (r.producers == null ||
          r.producers.some(
            (p) =>
              availableItemIds.has(p) &&
              (data.machineRecord[p].locations == null ||
                data.machineRecord[p].locations.some((l) =>
                  locationIds.has(l),
                )),
          )),
    );
    const availableRecipeIds = new Set(availableRecipes.map((r) => r.id));

    function pickItemIds(
      itemIds: string[] | undefined,
      defaultIds: string[],
    ): string[] {
      itemIds = coalesce(itemIds, defaultIds);
      return itemIds.filter((i) => availableItemIds.has(i));
    }

    const defaultBeltRankIds = coalesce(defaults?.beltRankIds, []);
    const beltRankIds = pickItemIds(state.beltRankIds, defaultBeltRankIds);
    const defaultWagonRankIds = coalesce(defaults?.wagonRankIds, []);
    const wagonRankIds = pickItemIds(state.wagonRankIds, defaultWagonRankIds);
    const defaultMachineRankIds = coalesce(defaults?.machineRankIds, []);
    const machineRankIds = pickItemIds(
      state.machineRankIds,
      defaultMachineRankIds,
    ).filter(
      (m) =>
        data.machineRecord[m].locations == null ||
        data.machineRecord[m].locations.some((l) => locationIds.has(l)),
    );
    const defaultFuelRankIds = coalesce(defaults?.fuelRankIds, []);
    const fuelRankIds = pickItemIds(state.fuelRankIds, defaultFuelRankIds);
    const defaultModuleRankIds = coalesce(defaults?.moduleRankIds, []);
    const moduleRankIds = pickItemIds(
      state.moduleRankIds,
      defaultModuleRankIds,
    );
    let defaultBeacons = defaults?.beacons;
    if (defaultBeacons) {
      // Prune default beacons to available beacons / modules
      defaultBeacons = defaultBeacons
        .map((b) => {
          if (b.id && !availableItemIds.has(b.id))
            b = spread(b, { id: undefined });
          if (b.modules) {
            b = spread(b, {
              modules: b.modules.map((m) => {
                if (m.id && !availableItemIds.has(m.id))
                  m = spread(m, { id: '' });
                return m;
              }),
            });
          }
          return b;
        })
        .filter((b) => b.id);
    }
    const defaultExcludedRecipeIds = new Set(defaults?.excludedRecipeIds);
    const excludedRecipeIds = coalesce(
      state.excludedRecipeIds,
      defaultExcludedRecipeIds,
    );

    return spread(state as Settings, {
      beltRankIds,
      defaultBeltRankIds,
      stack: coalesce(state.stack, coalesce(defaults?.beltStack, stack)),
      wagonRankIds,
      defaultWagonRankIds,
      excludedRecipeIds,
      defaultExcludedRecipeIds,
      recipeBonus,
      machineRankIds,
      defaultMachineRankIds,
      fuelRankIds,
      defaultFuelRankIds,
      moduleRankIds,
      defaultModuleRankIds,
      beacons: this.hydration.hydrateBeacons(state.beacons, defaultBeacons),
      overclock: state.overclock ?? defaults?.overclock,
      miningBonus: coalesce(state.miningBonus, miningBonus),
      researchBonus: coalesce(state.researchBonus, researchBonus),
      inserterBonus,
      researchProductivity: coalesce(
        state.researchProductivity,
        researchProductivity,
      ),
      researchedTechnologyIds,
      locationIds,
      defaultLocationIds: new Set(data.locationIds),
      availableRecipeIds,
      availableItemIds,
      quality,
    });
  }

  private qualityRecord(
    record: Partial<Record<string, Rational>>,
    quality: Quality,
    itemData: Record<string, ItemJson>,
    qualityDurability = false,
  ): Record<string, Rational> {
    const factor = qualityDurability
      ? rational.one.add(rational(quality.level))
      : rational.one;
    return toRecordEntries(record).reduce(
      (e: Record<string, Rational>, [k, val]) => {
        if (itemData[k].stack) {
          e[qualityId(k, quality)] = val.div(factor);
        } else e[k] = val;
        return e;
      },
      {},
    );
  }
}
