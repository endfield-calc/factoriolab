import { ComponentFixture, TestBed } from '@angular/core/testing';
import { loadModule } from 'glpk-ts';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import { ModData } from '~/data/schema/mod-data';
import { provideEndfield } from '~/endfield/providers';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import { rational } from '~/rational/rational';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { RecipeId } from '~/tests/recipe-id';
import { TestModule } from '~/tests/test-module';
import { setInputs } from '~/tests/utils';

import { RecipeDetail } from './recipe-detail';

describe('RecipeDetail', () => {
  let component: RecipeDetail;
  let fixture: ComponentFixture<RecipeDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, RecipeDetail],
    }).compileComponents();

    fixture = TestBed.createComponent(RecipeDetail);
    setInputs(fixture, {
      id: RecipeId.NuclearFuelReprocessing,
      collectionLabel: 'data.recipes',
    });
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('category', () => {
    it('should handle missing object', () => {
      setInputs(fixture, { id: 'id' });
      expect(component['category']()).toBeUndefined();
    });
  });

  describe('info', () => {
    it('should handle undefined recipe', () => {
      setInputs(fixture, { id: 'not-found' });
      const info = component['info']();
      expect(info.ingredientIds).toEqual([]);
      expect(info.catalystIds).toEqual([]);
      expect(info.productIds).toEqual([]);
    });
  });

  describe('changeExcluded', () => {
    it('should update the set and pass with defaults to the store dispatcher', () => {
      spyOn(component['settingsStore'], 'updateField');
      component.changeExcluded(false);
      expect(component['settingsStore'].updateField).toHaveBeenCalledWith(
        'excludedRecipeIds',
        new Set(),
        new Set([RecipeId.NuclearFuelReprocessing]),
      );
    });
  });

  describe('changeChecked', () => {
    it('should update the set and pass with defaults to the store dispatcher', () => {
      spyOn(component['settingsStore'], 'apply');
      component.changeChecked(true);
      expect(component['settingsStore'].apply).toHaveBeenCalledWith({
        checkedRecipeIds: new Set([RecipeId.NuclearFuelReprocessing]),
      });
    });
  });
});

describe('RecipeDetail Endfield costs', () => {
  beforeAll(async () => {
    await loadModule('glpk.all.wasm');
  });

  it('renders the effective ordinary and declared costs and reacts to power changes', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, RecipeDetail],
      providers: [
        ...provideEndfield(),
        { provide: SettingsStore, useClass: SettingsStore },
      ],
    }).compileComponents();
    const settings = TestBed.inject(SettingsStore);
    settings.apply({
      modId: 'aef',
      locationIds: new Set(['tundra', 'jinlong']),
    });
    settings['modDataResource'].set(rawData as unknown as ModData);
    settings['modHashResource'].set(rawHash);
    const recipes = TestBed.inject(RecipesStore);
    const endfield = TestBed.inject(EndfieldStore);
    const objectives = TestBed.inject(ObjectivesStore);
    TestBed.inject(PreferencesStore).apply({ paused: false });
    objectives.set({
      '1': {
        id: '1',
        targetId: 'originium_ore',
        value: rational(60),
        type: ObjectiveType.Output,
        unit: ObjectiveUnit.Items,
      },
    });
    const fixture = TestBed.createComponent(RecipeDetail);
    setInputs(fixture, {
      id: 'originium_ore',
      collectionLabel: 'data.recipes',
    });

    const costInput = async (): Promise<HTMLInputElement> => {
      fixture.detectChanges();
      await Promise.resolve();
      TestBed.tick();
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector(
        'tr:has(#cost) input',
      ) as HTMLInputElement | null;
      expect(input).not.toBeNull();
      if (input == null) throw new Error('Missing recipe cost input');
      return input;
    };

    // miner_2 has usage 5 and no footprint: the independent expected costs are
    // 5 * electric(1/2), with the product's machine weight equal to one.
    expect(recipes.settings()['originium_ore'].machineId).toBe('miner_2');
    expect(
      recipes.adjustedDataset().adjustedRecipe['originium_ore'].cost,
    ).toEqual(rational(5));
    expect((await costInput()).value).toBe('5');
    expect(objectives.matrixResult().resultType).toBe('solved');
    expect(objectives.matrixResult().cost).toEqual(rational(15));
    endfield.set({ ...endfield.state(), electric: rational(2) });
    expect(
      recipes.adjustedDataset().adjustedRecipe['originium_ore'].cost,
    ).toEqual(rational(10));
    expect((await costInput()).value).toBe('10');
    expect(objectives.matrixResult().resultType).toBe('solved');
    expect(objectives.matrixResult().cost).toEqual(rational(30));

    // A zero-output recipe's declared negative cost must not be normalized away.
    setInputs(fixture, { id: 'sewage-treat', collectionLabel: 'data.recipes' });
    expect(
      recipes.adjustedDataset().adjustedRecipe['sewage-treat'].cost,
    ).toEqual(rational(-30));
    expect((await costInput()).value).toBe('-30');
    recipes.updateRecordField('sewage-treat', 'cost', rational.zero);
    expect(
      recipes.adjustedDataset().adjustedRecipe['sewage-treat'].cost,
    ).toEqual(rational.zero);
    expect((await costInput()).value).toBe('0');
  });
});
