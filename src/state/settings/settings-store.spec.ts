import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { datasets } from '~/data/datasets';
import { EnergyType } from '~/data/schema/energy-type';
import { emptyModData } from '~/data/schema/mod-data';
import { QualityJson } from '~/data/schema/quality';
import { rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { ItemId } from '~/tests/item-id';
import {
  mockModData,
  mockModData11,
  mockModHash,
  mockModI18n,
  mockModId,
  mockModInfo,
} from '~/tests/mocks/data';
import { Mocks } from '~/tests/mocks/mocks';
import { mockPreferencesState } from '~/tests/mocks/preferences';
import { RecipeId } from '~/tests/recipe-id';
import { TestModule } from '~/tests/test-module';
import { assert } from '~/tests/utils';
import { spread } from '~/utils/object';

import { DisplayRate, displayRateInfo } from './display-rate';
import { Preset } from './preset';
import { Settings } from './settings';
import { initialSettingsState } from './settings-state';
import { SettingsStore } from './settings-store';

describe('SettingsStore', () => {
  let service: SettingsStore;
  let mocks: Mocks;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestModule] });
    service = TestBed.inject(SettingsStore);
    mocks = TestBed.inject(Mocks);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  describe('modData', () => {
    it('should handle nullish values', () => {
      spyOn(service, 'modId').and.returnValue(undefined);
      expect(service.modData()).toBeUndefined();
    });

    it('should get the base dataset', () => {
      expect(service.modData()).toEqual(mockModData);
    });

    it('should handle error in resource', () => {
      spyOn(service['modDataResource'], 'error').and.returnValue(new Error());
      service.apply({ modId: '1.1' });
      TestBed.tick();
      expect(service.modData()).toBeUndefined();
    });
  });

  describe('modHash', () => {
    it('should handle nullish values', () => {
      spyOn(service, 'modId').and.returnValue(undefined);
      expect(service.modHash()).toBeUndefined();
    });

    it('should get the base hash', () => {
      expect(service.modHash()).toEqual(mockModHash);
    });

    it('should handle error in resource', () => {
      spyOn(service['modHashResource'], 'error').and.returnValue(new Error());
      service.apply({ modId: '1.1' });
      TestBed.tick();
      expect(service.modHash()).toBeUndefined();
    });
  });

  describe('modI18n', () => {
    it('should get the i18n data', () => {
      spyOn(service['preferencesStore'], 'language').and.returnValue('zh');
      expect(service.modI18n()).toBeUndefined();
      service['modI18nResource'].set(mockModI18n);
      expect(service.modI18n()).toEqual(mockModI18n);
    });

    it('should handle error in resource', () => {
      spyOn(service['modI18nResource'], 'error').and.returnValue(new Error());
      service.apply({ modId: '1.1' });
      TestBed.tick();
      expect(service.modI18n()).toBeUndefined();
    });
  });

  describe('modInfo', () => {
    it('handles an unknown dataset without inventing registry metadata', () => {
      service.apply({ modId: 'missing-dataset' });
      expect(service.modInfo()).toBeUndefined();
      expect(service.game()).toBe('endfield');
    });
  });

  describe('game', () => {
    it('should return the game from the dataset metadata', () => {
      expect(service.game()).toEqual('endfield');
    });
  });

  describe('modStates', () => {
    it('should return the game states', () => {
      spyOn(service['preferencesStore'], 'states').and.returnValue(
        mockPreferencesState.states,
      );
      expect(service.modStates()).toEqual(
        mockPreferencesState.states[mockModId],
      );
    });
  });

  describe('stateOptions', () => {
    it('should return empty if mod is not yet set', () => {
      spyOn(service, 'modId').and.returnValue(undefined);
      expect(service.modStates()).toEqual({});
    });

    it('should return the options as a list', () => {
      spyOn(service['preferencesStore'], 'states').and.returnValue(
        mockPreferencesState.states,
      );
      expect(service.stateOptions()).toEqual([
        { label: 'name', value: 'name' },
      ]);
    });
  });

  describe('gameInfo', () => {
    it('should return the game info', () => {
      expect(service.gameInfo()).toEqual({
        label: 'options.game.endfield',
        modId: 'aef',
      });
    });

    it('should fall back to Endfield for an unknown dataset', () => {
      service.apply({ modId: 'missing-dataset' });
      expect(service.gameInfo()).toEqual({
        label: 'options.game.endfield',
        modId: 'aef',
      });
    });
  });

  describe('displayRateInfo', () => {
    it('should return the display rate info', () => {
      expect(service.displayRateInfo()).toEqual(
        displayRateInfo[DisplayRate.PerMinute],
      );
    });
  });

  describe('iconPath', () => {
    it('should get the dataset icon path', () => {
      service.apply({ modId: 'aef' });
      expect(service.iconPath()).toEqual('data/aef/icons.webp');
    });
  });

  describe('linkValueOptions', () => {
    it('should return the list of link value options', () => {
      expect(service.linkValueOptions().length).toEqual(6);
    });
  });

  describe('objectiveUnitOptions', () => {
    it('should return the list of options', () => {
      expect(service.objectiveUnitOptions().length).toEqual(4);
    });
  });

  describe('presetOptions', () => {
    it('should return the list of preset options', () => {
      expect(service.presetOptions().length).toEqual(5);
    });
  });

  describe('columnOptions', () => {
    it('should return column options', () => {
      expect(service.columnOptions().length).toEqual(10);
    });
  });

  describe('columnsState', () => {
    it('should return the columns state', () => {
      const result = service.columnsState();
      expect(result.wagons?.show).toBeTrue();
      expect(result.beacons?.show).toBeTrue();
      expect(result.pollution?.show).toBeTrue();
    });
  });

  describe('options', () => {
    it('should filter out belt options that are unaffected by quality', () => {
      const data = mocks.getDataset();
      data.beltIds.push(ItemId.Car);
      data.itemRecord[ItemId.Car].quality = {
        id: 'uncommon',
        level: 2,
        name: 'Uncommon',
      };
      data.beltRecord[ItemId.Car] = data.beltRecord[ItemId.TransportBelt];
      spyOn(service, 'dataset').and.returnValue(data);
      const options = service.options();
      expect(options.belts.find((o) => o.value === ItemId.Car)).toBeUndefined();
    });
  });

  describe('beltSpeed', () => {
    it('should return the map of belt speeds', () => {
      const flowRate = rational(2000n);
      spyOn(service, 'flowRate').and.returnValue(flowRate);
      const result = service.beltSpeed();
      expect(result[ItemId.TransportBelt]).toEqual(
        mocks.getAdjustedDataset().beltRecord[ItemId.TransportBelt].speed,
      );
      expect(result[ItemId.Pipe]).toEqual(flowRate);
    });
  });

  describe('beltSpeedTxt', () => {
    it('should map belt speeds to appropriate rounded values for tooltips', () => {
      spyOn(service, 'beltSpeed').and.returnValue({
        a: rational(1n, 60n),
        b: rational(1n, 180n),
      });
      const result = service.beltSpeedTxt();
      expect(result['a']).toEqual('1');
      expect(result['b']).toEqual('0.33');
    });
  });

  describe('modMenuItem', () => {
    it('should create a mod menu item', () => {
      expect(service.modMenuItem().label).toEqual(mockModInfo.name);
    });
  });

  describe('computeDefaults', () => {
    it('should handle null base data', () => {
      expect(service['computeDefaults'](undefined, 0)).toBeUndefined();
      expect(service['computeDefaults'](mockModData11, 0)).toBeUndefined();
    });

    it('should handle custom presets', () => {
      const result = service['computeDefaults'](mockModData, Preset.Beacon8);
      assert(result != null);
      expect(result.fuelRankIds).toEqual([ItemId.Coal]);
    });

    it('should include researched technologies if specified by custom presets', () => {
      const modData = {
        ...mockModData11,
        ...{
          defaults: {
            ...mockModData11.defaults,
            presets: [
              {
                id: 0,
                label: 'test',
                researchedTechnologies: [ItemId.ArtilleryShellRange],
              },
            ],
          },
        },
      };
      const result = service['computeDefaults'](modData, Preset.Beacon8);
      assert(result != null);
      expect(result.fuelRankIds).toEqual([ItemId.Coal]);
      expect(result.researchedTechnologyIds).toEqual(
        new Set([ItemId.ArtilleryShellRange]),
      );
    });
  });

  describe('computeDataset', () => {
    it('should return a complete dataset for the base and mods', () => {
      const modData = {
        ...mockModData,
        items: [
          ...mockModData.items,
          {
            id: 'proliferator',
            icon: ItemId.Coal,
            name: 'Proliferator',
            category: 'logistics',
            row: 0,
            module: { sprays: 1 },
          },
        ],
        locations: [{ id: 'nauvis', name: 'Nauvis', icon: ItemId.Coal }],
        qualities: [
          { id: 'normal', name: 'Normal', icon: ItemId.Coal, level: 1 },
        ],
      };
      const modI18n = {
        ...mockModI18n,
        locations: { nauvis: 'test' },
        qualities: { normal: 'test' },
      };

      const result = service['computeDataset'](
        mockModInfo,
        modData,
        mockModHash,
        modI18n,
        'endfield',
      );
      expect(result.categoryIds.length).toBeGreaterThan(0);
      expect(Object.keys(result.categoryRecord).length).toEqual(
        result.categoryIds.length,
      );
      expect(Object.keys(result.itemCategoryRows).length).toEqual(
        result.categoryIds.length,
      );
      expect(result.iconIds.length).toBeGreaterThan(0);
      expect(result.iconRecord).toBeDefined();
      expect(result.itemIds.length).toBeGreaterThan(0);
      expect(result.beltIds.length).toBeGreaterThan(0);
      expect(Object.keys(result.fuelIds).length).toBeGreaterThan(0);
      expect(result.machineIds.length).toBeGreaterThan(0);
      expect(result.moduleIds.length).toBeGreaterThan(0);
      expect(result.proliferatorModuleIds.length).toEqual(1);
      expect(Object.keys(result.itemRecord).length).toEqual(
        result.itemIds.length,
      );
      expect(result.recipeIds.length).toBeGreaterThan(0);
      expect(Object.keys(result.recipeRecord).length).toEqual(
        result.recipeIds.length,
      );
    });

    it('should sort beacons, belts, wagons, and fuels', () => {
      const modData = {
        ...mockModData,
        items: [
          ...mockModData.items,
          {
            id: 'id',
            icon: ItemId.Coal,
            name: 'Item',
            category: 'logistics',
            row: 0,
            beacon: {
              effectivity: 1,
              modules: 1,
              range: 1,
              type: EnergyType.Electric as const,
              usage: 1,
            },
            wagon: { itemTypes: ['item'], capacity: 1 },
            pipe: { speed: 1 },
          },
        ],
      };
      const result = service['computeDataset'](
        mockModInfo,
        modData,
        mockModHash,
        mockModI18n,
        'endfield',
      );
      expect(result.beaconIds).toEqual(['id', 'beacon']);
      expect(result.beltIds).toEqual([
        ItemId.TransportBelt,
        'fast-transport-belt',
        'express-transport-belt',
        'pump',
      ]);
      expect(result.wagonIds).toEqual([
        ItemId.CargoWagon,
        ItemId.FluidWagon,
        'id',
      ]);
      expect(result.fuelIds).toEqual([
        'steam',
        'steam-500',
        ItemId.Wood,
        ItemId.Coal,
        ItemId.SolidFuel,
        'rocket-fuel',
        'nuclear-fuel',
        'uranium-fuel-cell',
      ]);
    });

    it('should calculate missing recipe icons', () => {
      const icons = mockModData.icons.filter(
        (i) => i.id !== RecipeId.AdvancedOilProcessing,
      );
      const modData = { ...mockModData, icons };
      const result = service['computeDataset'](
        mockModInfo,
        modData,
        mockModHash,
        mockModI18n,
        'endfield',
      );
      expect(result.recipeRecord[RecipeId.AdvancedOilProcessing].icon).toEqual(
        ItemId.HeavyOil,
      );
    });

    it('should handle quality', () => {
      const modData = {
        ...mockModData,
        items: [
          ...mockModData.items,
          {
            id: 'id',
            icon: ItemId.Coal,
            name: 'Item',
            category: 'logistics',
            row: 0,
            stack: 1,
            beacon: {
              effectivity: 1,
              modules: 1,
              range: 1,
              type: EnergyType.Electric as const,
              usage: 1,
              qualityRecord: { uncommon: { effectivity: 2 } },
            },
            belt: {
              itemTypes: ['item'],
              speed: 1,
              qualityRecord: { uncommon: { speed: 2 } },
            },
            inserter: { speed: 1, qualityRecord: { uncommon: { speed: 2 } } },
            machine: { speed: 1, qualityRecord: { uncommon: { speed: 2 } } },
            module: { speed: 1, qualityRecord: { uncommon: { speed: 2 } } },
            pipe: { speed: 1, qualityRecord: { uncommon: { speed: 2 } } },
          },
          {
            id: 'techId',
            icon: ItemId.Coal,
            name: 'Tech',
            category: 'logistics',
            row: 0,
            technology: {
              recipeProductivity: [
                { id: RecipeId.ElectronicCircuit, value: 10 },
              ],
            },
          },
        ],
        recipes: [
          ...mockModData.recipes,
          {
            id: 'id',
            icon: RecipeId.Coal,
            name: 'Recipe',
            category: 'logistics',
            row: 0,
            time: 1,
            in: {},
            out: {},
          },
        ],
        qualities: [
          { id: 'normal', name: 'Normal', icon: ItemId.Coal, level: 0 },
          { id: 'uncommon', name: 'Uncommon', icon: ItemId.Coal, level: 1 },
        ],
      };
      const result = service['computeDataset'](
        mockModInfo,
        modData,
        mockModHash,
        mockModI18n,
        'endfield',
      );
      expect(result).toBeTruthy();
      expect(result.beaconRecord['id(1)']).toBeDefined();
      expect(result.beltRecord['id(1)']).toBeDefined();
      expect(result.inserterRecord['id(1)']).toBeDefined();
      expect(result.machineRecord['id(1)']).toBeDefined();
      expect(result.moduleRecord['id(1)']).toBeDefined();
      expect(result.beltRecord['id(1)']).toBeDefined();
    });
  });

  describe('computeSettings', () => {
    it('should overwrite defaults when specified', () => {
      const value: any = {
        modId: '1.1',
        beltId: ItemId.FastTransportBelt,
        pipeId: ItemId.Pipe,
        cargoWagonId: ItemId.CargoWagon,
        fluidWagonId: ItemId.FluidWagon,
        excludedRecipeIds: new Set(['excludedRecipes']),
        machineRankIds: [ItemId.AssemblingMachine2],
        fuelRankIds: [ItemId.Coal],
        moduleRankIds: [ItemId.SpeedModule],
      };
      const result = service['computeSettings'](
        value,
        service.defaults(),
        service.dataset(),
      );
      for (const key of Object.keys(value) as (keyof Settings)[])
        expect(result[key]).toEqual(value[key]);
      expect(result.quality).toBeUndefined();
    });

    it('should fall back if setting and defaults are undefined', () => {
      const result = service['computeSettings'](
        {} as any,
        undefined,
        service.dataset(),
      );
      expect(result.machineRankIds).toEqual([]);
      expect(result.fuelRankIds).toEqual([]);
      expect(result.moduleRankIds).toEqual([]);
    });

    it('should filter locations', () => {
      const settings = {
        ...initialSettingsState,
        locationIds: new Set(['1']),
        machineRankIds: [ItemId.Pumpjack],
      };
      const data = mocks.getDataset();
      data.locationIds = ['1', '2', '3'];
      data.recipeRecord[RecipeId.CrudeOil].locations = ['1'];
      data.itemRecord[ItemId.Pumpjack].machine!.locations = ['3'];
      const result = service['computeSettings'](settings, undefined, data);
      expect(result.locationIds).toEqual(new Set(['1']));
      expect(result.availableRecipeIds).not.toContain(RecipeId.CrudeOil);
      expect(result.machineRankIds).toHaveSize(0);
    });

    it('should process effects of researched technologies', () => {
      const settings = {
        ...initialSettingsState,
        researchedTechnologyIds: new Set(['tech1', 'tech2']),
      };
      const data = service.dataset();
      const normal: QualityJson = { id: 'normal', name: 'Normal', level: 0 };
      const uncommon: QualityJson = {
        id: 'uncommon',
        name: 'Uncommon',
        level: 1,
      };
      data.qualityIds = ['normal', 'uncommon'];
      data.qualityRecord = { normal, uncommon };
      data.technologyIds.push('tech1', 'tech2');
      data.technologyRecord['tech1'] = {
        beltStack: rational.one,
        inserterStack: [{ value: rational.one }],
        miningProductivity: rational.one,
        qualityUnlock: ['normal'],
        recipeProductivity: [
          { id: RecipeId.ElectronicCircuit, value: rational.one },
        ],
        researchSpeed: rational.one,
        researchProductivity: rational.one,
      };
      data.technologyRecord['tech2'] = {
        qualityUnlock: ['uncommon'],
      };
      const result = service['computeSettings'](
        settings,
        service.defaults(),
        data,
      );
      expect(result.researchedTechnologyIds.size).toEqual(2);
      expect(result.stack).toEqual(rational(2n));
      expect(result.inserterBonus).toEqual({ '': rational.one });
      expect(result.miningBonus).toEqual(rational(100n));
      expect(result.quality).toEqual(uncommon);
      expect(result.researchBonus).toEqual(rational(100n));
      expect(result.researchProductivity).toEqual(rational(100n));
      expect(result.recipeBonus[RecipeId.ElectronicCircuit]).toEqual(
        rational(100n),
      );
      expect(result.beacons).toEqual([]);
    });

    it('should handle no items available for settings', () => {
      const settings = { ...initialSettingsState };
      const data = mocks.getDataset();
      const result = service['computeSettings'](
        settings,
        {
          beltRankIds: ['nonsense'],
          fuelRankIds: [],
          excludedRecipeIds: [],
          machineRankIds: [],
          moduleRankIds: [],
          beacons: [],
        },
        data,
      );
      expect(result.beltRankIds).toEqual([]);
    });

    it('should use default bonus values if greater than calculated values', () => {
      const defaults = spread(service.defaults(), {
        miningBonus: rational(100n),
        researchBonus: rational(300n),
        researchProductivity: rational(50n),
        recipeProductivity: {
          [RecipeId.SteelPlate]: rational(80n),
        },
      });
      const result = service['computeSettings'](
        service.state(),
        defaults,
        service.dataset(),
      );
      expect(result.miningBonus).toEqual(rational(100n));
      expect(result.researchBonus).toEqual(rational(300n));
      expect(result.researchProductivity).toEqual(rational(50n));
      expect(result.recipeBonus[RecipeId.SteelPlate]).toEqual(rational(80n));
    });
  });
});

describe('SettingsStore dataset HTTP boundary', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('keeps the historical Endfield indices without other selectable datasets', () => {
    expect(datasets.mods.map((mod) => mod.id)).toEqual(['aef']);
    expect(datasets.modHashV0).toEqual(['1.1', '1.0', 'aef']);
    expect(datasets.modHash).toEqual([
      '1.1',
      '1.0',
      ...Array<null>(14).fill(null),
      'aef',
    ]);
  });

  it('reports a failed transfer file while leaving the ordinary dataset usable', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const settings = TestBed.inject(SettingsStore);
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(PreferencesStore).apply({ language: 'en' });
    settings.apply({ modId: 'aef' });
    TestBed.tick();
    http.expectOne('data/aef/data.json').flush(emptyModData());
    http.expectOne('data/aef/hash.json').flush(mockModHash);
    http
      .expectOne('data/aef/transfer.json')
      .flush('missing', { status: 404, statusText: 'Not Found' });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(settings.transferData()).toBeUndefined();
    expect(settings.transferError()).toBeTruthy();
    expect(settings.modData()).toEqual(emptyModData());
    http.verify();
  });

  it('loads supported entity languages and uses base names for others', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const settings = TestBed.inject(SettingsStore);
    const preferences = TestBed.inject(PreferencesStore);
    const http = TestBed.inject(HttpTestingController);
    preferences.apply({ language: 'en' });
    settings.apply({ modId: 'aef' });
    TestBed.tick();
    const data = emptyModData();
    data.categories = [{ id: 'category', name: 'English' }];
    data.icons = [{ id: 'category', x: 0, y: 0, color: '#fff' }];
    data.version = { game: 'aef' };
    http.expectOne('data/aef/data.json').flush(data);
    http.expectOne('data/aef/hash.json').flush(mockModHash);
    http
      .expectOne('data/aef/transfer.json')
      .flush({ schemaVersion: 1, sources: [], items: [] });
    http.expectNone((request) => request.url.startsWith('data/aef/i18n/'));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(settings.modData()?.version).toEqual({ game: 'aef' });
    expect(settings.modHash()).toEqual(mockModHash);
    expect(settings.dataset().categoryRecord['category'].name).toBe('English');

    for (const language of ['zh', 'ja', 'ru'] as const) {
      preferences.apply({ language });
      TestBed.tick();
      const request = http.expectOne(`data/aef/i18n/${language}.json`);
      expect(settings.loading()).toBeTrue();
      request.flush({
        categories: { category: language },
        items: {},
        recipes: {},
      });
      await TestBed.inject(ApplicationRef).whenStable();
      expect(settings.dataset().categoryRecord['category'].name).toBe(language);
    }

    preferences.apply({ language: 'de' });
    TestBed.tick();
    http.expectNone((request) => request.url.startsWith('data/aef/i18n/'));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(settings.loading()).toBeFalse();
    expect(settings.dataset().categoryRecord['category'].name).toBe('English');

    preferences.apply({ language: 'ja' });
    TestBed.tick();
    http.expectOne('data/aef/i18n/ja.json').flush('missing', {
      status: 404,
      statusText: 'Not Found',
    });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(settings.dataset().categoryRecord['category'].name).toBe('English');

    settings.apply({ modId: 'example' });
    TestBed.tick();
    http.expectOne('data/example/data.json').flush(data);
    http.expectOne('data/example/hash.json').flush(mockModHash);
    http.expectOne('data/example/i18n/ja.json').flush(mockModI18n);
    await TestBed.inject(ApplicationRef).whenStable();
    http.verify({ ignoreCancelled: true });
  });
});
