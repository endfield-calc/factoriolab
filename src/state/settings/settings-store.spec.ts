import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { modRecord } from '~/data/datasets';
import { CUSTOM_MOD, Game } from '~/data/game';
import { gameInfo } from '~/data/game-info';
import { EnergyType } from '~/data/schema/energy-type';
import { emptyModData } from '~/data/schema/mod-data';
import { QualityJson } from '~/data/schema/quality';
import { createEndfieldProduct } from '~/endfield/product/product';
import { PRODUCT_PROFILE } from '~/extensions/product-profile';
import { rational } from '~/rational/rational';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { ItemId } from '~/tests/item-id';
import {
  mockDefaults11,
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

  describe('customIconsUrl', () => {
    it('should return an object url', () => {
      spyOn(service.customIcons, 'value').and.returnValue({} as any);
      spyOn(URL, 'createObjectURL').and.returnValue('url');
      expect(service.customIconsUrl()).toEqual('url');
    });

    it('should return empty string when invalid', () => {
      spyOn(service.customIcons, 'value').and.returnValue({} as any);
      spyOn(URL, 'createObjectURL').and.throwError('');
      expect(service.customIconsUrl()).toEqual('');
    });

    it('should return empty string when not configured', () => {
      expect(service.customIconsUrl()).toEqual('');
    });
  });

  describe('modDataResource', () => {
    it('should return undefined if custom', () => {
      service.apply({ modId: CUSTOM_MOD });
      TestBed.tick();
      expect(service['modDataResource'].value()).toBeUndefined();
    });
  });

  describe('modHashResource', () => {
    it('should return undefined if custom', () => {
      service.apply({ modId: CUSTOM_MOD });
      TestBed.tick();
      expect(service['modHashResource'].value()).toBeUndefined();
    });
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

    it('should handle custom data', () => {
      service.apply({ modId: CUSTOM_MOD });
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

    it('should get the custom mod hash', () => {
      spyOn(service.customHash, 'value').and.returnValue({} as any);
      service.apply({ modId: CUSTOM_MOD });
      TestBed.tick();
      expect(service.modHash()).toEqual({} as any);
    });

    it('should get handle missing custom mod hash', () => {
      service.apply({ modId: CUSTOM_MOD });
      TestBed.tick();
      expect(service.modHash()).toBeUndefined();
    });

    it('should handle error in resource', () => {
      spyOn(service['modHashResource'], 'error').and.returnValue(new Error());
      service.apply({ modId: '1.1' });
      TestBed.tick();
      expect(service.modHash()).toBeUndefined();
    });
  });

  describe('modI18n', () => {
    it('should handle nullish values', () => {
      spyOn(service, 'modId').and.returnValue(undefined);
      expect(service.modI18n()).toBeUndefined();
    });

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

  describe('loadError', () => {
    it('reports data and hash failures while ignoring translation failures', () => {
      const dataError = new Error('data');
      const hashError = new Error('hash');
      const data = signal<Error | undefined>(undefined);
      const hash = signal<Error | undefined>(undefined);
      spyOn(service['modDataResource'], 'error').and.callFake(data);
      spyOn(service['modHashResource'], 'error').and.callFake(hash);
      spyOn(service['modI18nResource'], 'error').and.returnValue(
        new Error('translation'),
      );
      expect(service.loadError()).toBeUndefined();
      data.set(dataError);
      expect(service.loadError()).toBe(dataError);
      data.set(undefined);
      hash.set(hashError);
      expect(service.loadError()).toBe(hashError);
    });
  });

  describe('game', () => {
    it('should return the game or Factorio', () => {
      expect(service.game()).toEqual('factorio');
    });

    it('falls back when a saved mod identifier is unknown', () => {
      service.apply({ modId: 'missing-dataset' });
      expect(service.modInfo()).toBeUndefined();
      expect(service.game()).toBe('factorio');
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
      expect(service.gameInfo()).toEqual(gameInfo.factorio);
    });
  });

  describe('displayRateInfo', () => {
    it('should return the display rate info', () => {
      expect(service.displayRateInfo()).toEqual(
        displayRateInfo[DisplayRate.PerMinute],
      );
    });
  });

  describe('modOptions', () => {
    it('should get mod options for a game', () => {
      expect(service.modOptions().length).toBeGreaterThan(0);
    });
  });

  describe('iconPath', () => {
    it('should get a custom mod path', () => {
      service.apply({ modId: CUSTOM_MOD });
      spyOn(service, 'customIconsUrl').and.returnValue('test');
      expect(service.iconPath()).toEqual('test');
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
      expect(
        service['computeDefaults'](undefined, mockModData, 0),
      ).toBeUndefined();
    });

    it('should use minimum values', () => {
      const result = service['computeDefaults'](
        mockModInfo,
        mockModData11,
        Preset.Minimum,
      );
      assert(result != null);
      expect(result.beltRankIds).toEqual(mockDefaults11.minBeltRank);
      expect(result.machineRankIds).toEqual(mockDefaults11.minMachineRank!);
      expect(result.moduleRankIds).toEqual([]);
      expect(result.beacons).toEqual([
        {
          count: rational.zero,
          id: ItemId.Beacon,
          modules: [{ count: rational(2n), id: ItemId.SpeedModule3 }],
        },
      ]);
    });

    it('should use 8 beacons', () => {
      const result = service['computeDefaults'](
        mockModInfo,
        mockModData11,
        Preset.Beacon8,
      );
      assert(result != null);
      expect(result.beacons).toEqual([
        {
          count: rational(8n),
          id: ItemId.Beacon,
          modules: [{ count: rational(2n), id: ItemId.SpeedModule3 }],
        },
      ]);
    });

    it('should use 12 beacons', () => {
      const result = service['computeDefaults'](
        mockModInfo,
        mockModData11,
        Preset.Beacon12,
      );
      assert(result != null);
      expect(result.beacons).toEqual([
        {
          count: rational(12n),
          id: ItemId.Beacon,
          modules: [{ count: rational(2n), id: ItemId.SpeedModule3 }],
        },
      ]);
    });

    it('should handle DSP minimum module rank', () => {
      const modInfo = { ...mockModInfo, game: 'dyson-sphere-program' as Game };
      const result = service['computeDefaults'](
        modInfo,
        mockModData11,
        Preset.Minimum,
      );
      assert(result != null);
      expect(result.moduleRankIds).toEqual([]);
    });

    it('should handle DSP maximum module rank', () => {
      const modInfo = { ...mockModInfo, game: 'dyson-sphere-program' as Game };
      const result = service['computeDefaults'](
        modInfo,
        mockModData11,
        Preset.Beacon8,
      );
      assert(result != null);
      expect(result.moduleRankIds).toEqual(mockDefaults11.moduleRank!);
    });

    it('should handle Satisfactory module rank', () => {
      const modInfo = { ...mockModInfo, game: 'satisfactory' as Game };
      const result = service['computeDefaults'](
        modInfo,
        mockModData11,
        Preset.Beacon8,
      );
      assert(result != null);
      expect(result.moduleRankIds).toEqual(mockDefaults11.moduleRank!);
      expect(result.overclock).toEqual(rational(100n));
    });

    it('should handle Final Factory module rank', () => {
      const modInfo = { ...mockModInfo, game: 'final-factory' as Game };
      const result = service['computeDefaults'](
        modInfo,
        mockModData11,
        Preset.Beacon8,
      );
      assert(result != null);
      expect(result.moduleRankIds).toEqual(mockDefaults11.moduleRank!);
    });

    it('should handle custom presets', () => {
      const result = service['computeDefaults'](
        mockModInfo,
        mockModData,
        Preset.Beacon8,
      );
      assert(result != null);
      expect(result.fuelRankIds).toEqual([ItemId.Coal]);
    });

    it('should include researched technologies if specified by hard coded presets', () => {
      const modData = {
        ...mockModData11,
        ...{
          defaults: {
            ...mockModData11.defaults,
            researchedTechnologies: [ItemId.ArtilleryShellRange],
          },
        },
      };
      const result = service['computeDefaults'](
        mockModInfo,
        modData,
        Preset.Beacon8,
      );
      assert(result != null);
      expect(result.fuelRankIds).toEqual([ItemId.Coal]);
      expect(result.researchedTechnologyIds).toEqual(
        new Set([ItemId.ArtilleryShellRange]),
      );
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
      const result = service['computeDefaults'](
        mockModInfo,
        modData,
        Preset.Beacon8,
      );
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
        'factorio',
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
        'factorio',
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
        'factorio',
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
        'factorio',
      );
      expect(result).toBeTruthy();
      expect(result.beaconRecord['id(1)']).toBeDefined();
      expect(result.beltRecord['id(1)']).toBeDefined();
      expect(result.inserterRecord['id(1)']).toBeDefined();
      expect(result.machineRecord['id(1)']).toBeDefined();
      expect(result.moduleRecord['id(1)']).toBeDefined();
      expect(result.beltRecord['id(1)']).toBeDefined();
    });

    it('should use the correct file for custom data', () => {
      spyOn(service, 'customIconsUrl').and.returnValue('test');
      const modInfo = { ...mockModInfo, id: CUSTOM_MOD };
      const result = service['computeDataset'](
        modInfo,
        mockModData,
        mockModHash,
        undefined,
        'factorio',
      );
      expect(result.iconRecord.item[ItemId.Coal].file).toEqual('test');
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

describe('SettingsStore with Endfield product', () => {
  let service: SettingsStore;
  let preferences: PreferencesStore;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(false, 'zh'),
        },
      ],
    });
    service = TestBed.inject(SettingsStore);
    preferences = TestBed.inject(PreferencesStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('requests English game translations and clears them when the language has no package', async () => {
    service.apply({ modId: 'aef' });
    TestBed.tick();
    const data = emptyModData();
    data.categories = [{ id: 'category', name: '中文' }];
    data.icons = [{ id: 'category', x: 0, y: 0, color: '#fff' }];
    data.version = { game: 'base' };
    http.expectOne('data/aef/data.json').flush(data);
    http.expectOne('data/aef/hash.json').flush(mockModHash);
    http.expectOne('data/aef/i18n/en.json').flush({
      name: 'Endfield',
      version: { game: 'translated' },
      categories: { category: 'English' },
      items: {},
      recipes: {},
    });
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();
    expect(service.modInfo()?.name).toBe('Endfield');
    expect(service.dataset().categoryRecord['category'].name).toBe('English');
    expect(service.dataset().version).toEqual({ game: 'translated' });
    preferences.apply({ language: 'ja' });
    expect(service.modI18n()).toBeUndefined();
    TestBed.tick();
    http.expectOne('data/aef/i18n/ja.json').flush({
      name: '日本語',
      categories: { category: '日本語' },
      items: {},
      recipes: {},
    });
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();
    expect(service.modInfo()?.name).toBe('日本語');
    preferences.apply({ language: 'de' });
    expect(service.modI18n()).toBeUndefined();
    TestBed.tick();
    http.expectNone('data/aef/i18n/de.json');
    expect(service.modI18n()).toBeUndefined();
    expect(service.dataset().categoryRecord['category'].name).toBe('中文');
    expect(service.dataset().version).toEqual({ game: 'base' });
  });

  it('uses the base dataset when a translation request fails', async () => {
    service.apply({ modId: 'aef' });
    TestBed.tick();
    const data = emptyModData();
    data.categories = [{ id: 'category', name: '中文' }];
    data.icons = [{ id: 'category', x: 0, y: 0, color: '#fff' }];
    http.expectOne('data/aef/data.json').flush(data);
    http.expectOne('data/aef/hash.json').flush(mockModHash);
    http.expectOne('data/aef/i18n/en.json').flush('missing', {
      status: 404,
      statusText: 'Not Found',
    });
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();

    expect(service.loading()).toBeFalse();
    expect(service.loadError()).toBeUndefined();
    expect(service.modI18n()).toBeUndefined();
    expect(service.modInfo()?.name).toBe(modRecord['aef'].name);
    expect(service.dataset().categoryRecord['category'].name).toBe('中文');
    expect(service.retryFailedResources()).toBeFalse();
  });

  it('does not issue duplicate retries while failed data and hash requests reload', async () => {
    service.apply({ modId: 'aef' });
    TestBed.tick();
    for (const path of ['data', 'hash']) {
      http.expectOne(`data/aef/${path}.json`).flush('unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      });
    }
    http.expectOne('data/aef/i18n/en.json').flush({});
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();
    expect(service.loading()).toBeFalse();
    expect(service.loadError()).toBeDefined();

    expect(service.retryFailedResources()).toBeTrue();
    expect(service.loading()).toBeTrue();
    expect(service.loadError()).toBeUndefined();
    expect(service.retryFailedResources()).toBeFalse();
    TestBed.tick();
    const dataRetry = http.expectOne('data/aef/data.json');
    const hashRetry = http.expectOne('data/aef/hash.json');
    http.expectNone('data/aef/data.json');
    http.expectNone('data/aef/hash.json');
    dataRetry.flush(emptyModData());
    hashRetry.flush(mockModHash);
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.tick();
    expect(service.loading()).toBeFalse();
    expect(service.loadError()).toBeUndefined();
    expect(service.modData()).toEqual(emptyModData());
    expect(service.modHash()).toEqual(mockModHash);
    expect(service.retryFailedResources()).toBeFalse();
  });

  it('filters runtime options and never requests other game or custom data', () => {
    expect(service.gameOptions.map((option) => option.value)).toEqual([
      'endfield',
    ]);
    service.apply({ modId: '2x1' });
    TestBed.tick();
    expect(service.modData()).toBeUndefined();
    expect(service.modHash()).toBeUndefined();
    expect(service.modOptions()).toEqual([]);
    http.expectNone((request) => request.url.startsWith('data/2x1/'));
    service.apply({ modId: CUSTOM_MOD });
    TestBed.tick();
    expect(service.modData()).toBeUndefined();
    http.expectNone((request) => request.url.startsWith('data/cst/'));
  });

  it('prepares a candidate from effective defaults without changing the live store', () => {
    const before = service.state();
    const result = service.prepareState(
      { modId: 'aef', costs: { surplus: rational.zero } },
      mockModData,
      mockModHash,
    );
    expect(result.data.modId).toBe('aef');
    expect(result.settings.costs.surplus.eq(rational.zero)).toBeTrue();
    expect(result.settings.costs.recycling.eq(rational(1000))).toBeTrue();
    expect(service.state()).toBe(before);
    expect(() =>
      service.prepareState({ modId: '2x1' }, mockModData, mockModHash),
    ).toThrow();
  });
});
