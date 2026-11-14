import { ApplicationRef, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { createEndfieldPresentation } from '~/endfield/adapters/presentation-extension';
import {
  createEndfieldState,
  resourceObjectiveId,
} from '~/endfield/domain/model';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import {
  PRESENTATION_EXTENSION,
  PresentationExtension,
} from '~/extensions/presentation-extension';
import {
  EFFECTIVE_DEFAULTS,
  upstreamProduct,
} from '~/extensions/product-profile';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { initialColumnsState } from '~/state/preferences/columns-state';
import { ItemId } from '~/tests/item-id';
import { Mocks } from '~/tests/mocks/mocks';
import { TestModule } from '~/tests/test-module';
import { assert, setInputs } from '~/tests/utils';

import { Steps } from './steps';

describe('Steps', () => {
  let component: Steps;
  let fixture: ComponentFixture<Steps>;
  let mocks: Mocks;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Steps],
    }).compileComponents();

    fixture = TestBed.createComponent(Steps);
    mocks = TestBed.inject(Mocks);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a presentation-provided link fragment and omits it for ordinary links', async () => {
    spyOn(component['objectivesStore'], 'steps').and.returnValue([
      mocks.step1(),
    ]);
    // Start the view with a populated result so its computed table is not cached empty.
    fixture.destroy();
    fixture = TestBed.createComponent(Steps);
    component = fixture.componentInstance;
    const fragment = signal<string | undefined>('sample-resource-panel');
    spyOn(component['presentation'], 'stepFragment').and.callFake(fragment);
    component['preferencesStore'].apply({
      columns: {
        ...initialColumnsState,
        link: { ...initialColumnsState.link, show: true },
      },
    });
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const link = element.querySelector<HTMLAnchorElement>(
      'td a[target="_blank"]',
    );
    assert(link != null);
    expect(link.hash).toBe('#sample-resource-panel');
    fragment.set(undefined);
    fixture.detectChanges();
    expect(link.hash).toBe('');
  });

  describe('steps', () => {
    it('should filter by the selected id', async () => {
      spyOn(component['objectivesStore'], 'steps').and.returnValue(
        mocks.steps(),
      );
      setInputs(fixture, { selectedId: mocks.step1().id, focus: true });
      await TestBed.inject(ApplicationRef).whenStable();
      expect(component['steps']()).toHaveSize(1);
    });
  });

  describe('sortedSteps', () => {
    it('should sort based on the specified column', () => {
      spyOn<any>(component, 'steps').and.returnValue(mocks.steps());
      component['tableStore'].apply({ sort: 'wagons', asc: true });
      expect(component['sortedSteps']()).toEqual([
        mocks.step2(),
        mocks.step1(),
      ]);
    });
  });

  describe('leftSpan', () => {
    it('should account for the checkbox and tree columns', () => {
      expect(component['leftSpan']()).toEqual(3);
      component['preferencesStore'].apply({
        columns: {
          ...initialColumnsState,
          ...{
            checkbox: { ...initialColumnsState.checkbox, ...{ show: true } },
          },
        },
      });
      expect(component['leftSpan']()).toEqual(4);
    });
  });

  describe('toggleStep', () => {
    it('should toggle a step to be expanded and collapsed', () => {
      component.toggleStep('id');
      expect(component['expandedSteps']()).toContain('id');
      component.toggleStep('id');
      expect(component['expandedSteps']()).not.toContain('id');
    });
  });

  describe('resetStep', () => {
    it('should call to reset an item and recipe', () => {
      const step = mocks.step1();
      spyOn(component['itemsStore'], 'resetId');
      spyOn(component['recipesStore'], 'resetId');
      component.resetStep(step);
      expect(component['itemsStore'].resetId).toHaveBeenCalledWith(
        step.itemId!,
      );
      expect(component['recipesStore'].resetId).toHaveBeenCalledWith(
        step.recipeId!,
      );
    });

    it('should call to reset recipe settings on a recipe objective', () => {
      let step = mocks.step1();
      step = { ...step, ...{ recipeObjectiveId: 'id' } };
      spyOn(component['objectivesStore'], 'updateRecord');
      component.resetStep(step);
      expect(component['objectivesStore'].updateRecord).toHaveBeenCalledWith(
        'id',
        {
          machineId: undefined,
          fuelId: undefined,
          modules: undefined,
          beacons: undefined,
          overclock: undefined,
        },
      );
    });
  });

  describe('changeModulesBeacons', () => {
    it('should update recipe modules and beacons', () => {
      let step = mocks.step1();
      step = {
        ...step,
        ...{ recipeSettings: { machineId: ItemId.AssemblingMachine3 } },
      };
      spyOn(component['objectivesStore'], 'updateRecipeField');
      component.changeModulesBeacons(step, { modules: [], beacons: [] });
      expect(
        component['objectivesStore'].updateRecipeField,
      ).toHaveBeenCalledWith(step, 'modules', []);
      expect(
        component['objectivesStore'].updateRecipeField,
      ).toHaveBeenCalledWith(step, 'beacons', []);
    });

    it('should update recipe objective modules and beacons', () => {
      let step = mocks.step1();
      step = {
        ...step,
        ...{
          recipeObjectiveId: 'id',
          recipeSettings: { machineId: ItemId.AssemblingMachine3 },
        },
      };
      spyOn(component['objectivesStore'], 'updateRecipeField');
      component.changeModulesBeacons(step, { modules: [], beacons: [] });
      expect(
        component['objectivesStore'].updateRecipeField,
      ).toHaveBeenCalledWith(step, 'modules', []);
      expect(
        component['objectivesStore'].updateRecipeField,
      ).toHaveBeenCalledWith(step, 'beacons', []);
    });

    it('should exit early if no recipe or machineId is found', () => {
      const step = mocks.step1();
      spyOn(component['objectivesStore'], 'updateRecipeField');
      component.changeModulesBeacons(step, { modules: [], beacons: [] });
      expect(
        component['objectivesStore'].updateRecipeField,
      ).not.toHaveBeenCalled();
    });

    it('clears ordinary overrides when selections return to defaults', () => {
      const step = {
        ...mocks.step1(),
        recipeSettings: { machineId: ItemId.AssemblingMachine3 },
      };
      const id = step.recipeId;
      if (id == null) throw new Error('Expected recipe in test fixture');
      component['recipesStore'].updateRecord(id, {
        modules: [{ id: 'module' }],
        beacons: [{ id: 'beacon' }],
      });
      spyOn(component['hydration'], 'dehydrateModules').and.returnValue(
        undefined,
      );
      spyOn(component['hydration'], 'dehydrateBeacons').and.returnValue(
        undefined,
      );
      component.changeModulesBeacons(step, { modules: [{ id: 'module' }] });
      expect(component['recipesStore'].state()[id]?.modules).toBeUndefined();
      expect(component['recipesStore'].state()[id]?.beacons).toEqual([
        { id: 'beacon' },
      ]);
      component.changeModulesBeacons(step, { beacons: [{ id: 'beacon' }] });
      expect(component['recipesStore'].state()[id]).toBeUndefined();
    });
  });

  it('writes derived modules and beacons through their owner without a ghost objective', () => {
    const step = {
      ...mocks.step1(),
      recipeObjectiveId: 'ef:resource:test',
      recipeSettings: { machineId: ItemId.AssemblingMachine3 },
    };
    const owner = { kind: 'extension' as const, id: 'resource:test' };
    spyOn(component['presentation'], 'owner').and.returnValue(owner);
    spyOn(component['presentation'], 'updateRecipeField').and.returnValue(true);
    component.changeModulesBeacons(step, { modules: [], beacons: [] });
    expect(component['presentation'].updateRecipeField).toHaveBeenCalledWith(
      owner,
      'modules',
      [],
      undefined,
    );
    expect(component['presentation'].updateRecipeField).toHaveBeenCalledWith(
      owner,
      'beacons',
      [],
      undefined,
    );
    expect(
      component['objectivesStore'].state()['ef:resource:test'],
    ).toBeUndefined();
  });

  it('keeps an extension reset out of ordinary objectives while preserving item reset', () => {
    const step = { ...mocks.step1(), recipeObjectiveId: 'ef:resource:test' };
    const owner = { kind: 'extension' as const, id: 'resource:test' };
    spyOn(component['presentation'], 'owner').and.returnValue(owner);
    spyOn(component['presentation'], 'resetRecipe').and.returnValue(true);
    spyOn(component['itemsStore'], 'resetId');
    spyOn(component['objectivesStore'], 'updateRecord');
    component.resetStep(step);
    expect(component['itemsStore'].resetId).toHaveBeenCalledWith(step.itemId!);
    expect(component['presentation'].resetRecipe).toHaveBeenCalledWith(owner);
    expect(component['objectivesStore'].updateRecord).not.toHaveBeenCalled();
  });

  it('routes derived selection through the extension but keeps item priority', () => {
    const step = { ...mocks.step1(), recipeObjectiveId: 'ef:resource:test' };
    spyOn(component['presentation'], 'toggleChecked').and.returnValue(true);
    spyOn(component['settingsStore'], 'apply');
    component.changeStepChecked(step, true);
    expect(component['presentation'].toggleChecked).not.toHaveBeenCalled();
    expect(component['settingsStore'].apply).toHaveBeenCalled();
    (component['settingsStore'].apply as jasmine.Spy).calls.reset();
    component.changeStepChecked({ ...step, itemId: undefined }, true);
    expect(component['presentation'].toggleChecked).toHaveBeenCalled();
    expect(component['settingsStore'].apply).not.toHaveBeenCalled();
  });

  describe('changeStepChecked', () => {
    it('should set checked state based on the step item', () => {
      const step = mocks.step1();
      spyOn(component['settingsStore'], 'apply');
      component.changeStepChecked(step, true);
      expect(component['settingsStore'].apply).toHaveBeenCalledWith({
        checkedItemIds: new Set([step.itemId]),
      });
    });

    it('should set checked state based on the step recipe', () => {
      const step = { ...mocks.step1(), itemId: undefined };
      spyOn(component['settingsStore'], 'apply');
      component.changeStepChecked(step, true);
      expect(component['settingsStore'].apply).toHaveBeenCalledWith({
        checkedRecipeIds: new Set([step.recipeId]),
      });
    });

    it('should set checked state based on the step recipe objective', () => {
      const step = {
        ...mocks.step1(),
        itemId: undefined,
        recipeObjectiveId: 'id',
      };
      spyOn(component['settingsStore'], 'apply');
      component.changeStepChecked(step, true);
      expect(component['settingsStore'].apply).toHaveBeenCalledWith({
        checkedObjectiveIds: new Set([step.recipeObjectiveId]),
      });
    });
  });

  describe('resetChecked', () => {
    it('should apply the state to the settingsStore', () => {
      spyOn(component['settingsStore'], 'apply');
      component.resetChecked();
      expect(component['settingsStore'].apply).toHaveBeenCalled();
    });
  });

  describe('resetExcludeditems', () => {
    it('should apply the state to the settingsStore', () => {
      spyOn(component['settingsStore'], 'apply');
      component.resetExcludedItems();
      expect(component['settingsStore'].apply).toHaveBeenCalled();
    });
  });

  describe('changeBelts', () => {
    it('should update the item stack and beltId based on the result', () => {
      spyOn(component['itemsStore'], 'updateRecordField');
      component.changeBelts(ItemId.AdvancedCircuit, {} as any);
      expect(component['itemsStore'].updateRecordField).toHaveBeenCalledTimes(
        2,
      );
    });

    it('should return early if state is undefined', () => {
      spyOn(component['itemsStore'], 'updateRecordField');
      component.changeBelts(ItemId.AdvancedCircuit, undefined);
      expect(component['itemsStore'].updateRecordField).not.toHaveBeenCalled();
    });
  });

  describe('resetMachines', () => {
    it('should call to reset the objectivesStore and recipesStore', () => {
      spyOn(component['objectivesStore'], 'resetFields');
      spyOn(component['recipesStore'], 'resetFields');
      component.resetMachines();
      expect(component['objectivesStore'].resetFields).toHaveBeenCalled();
      expect(component['recipesStore'].resetFields).toHaveBeenCalled();
    });
  });

  describe('resetBeacons', () => {
    it('should call to reset the objectivesStore and recipesStore', () => {
      spyOn(component['objectivesStore'], 'resetFields');
      spyOn(component['recipesStore'], 'resetFields');
      component.resetBeacons();
      expect(component['objectivesStore'].resetFields).toHaveBeenCalled();
      expect(component['recipesStore'].resetFields).toHaveBeenCalled();
    });
  });
});

describe('Steps derived resource settings', () => {
  it('shows the upstream tree, item and recipe icons for the Endfield view', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Steps],
      providers: [
        {
          provide: EFFECTIVE_DEFAULTS,
          useValue: {
            ...upstreamProduct.defaults(),
            extension: createEndfieldState(),
          },
        },
        {
          provide: PRESENTATION_EXTENSION,
          useFactory: (): PresentationExtension =>
            createEndfieldPresentation(inject(EndfieldStore)),
        },
      ],
    }).compileComponents();
    const step = TestBed.inject(Mocks).step1();
    const objectives = TestBed.inject(ObjectivesStore);
    spyOn(objectives, 'steps').and.returnValue([step]);
    spyOn(objectives, 'stepTree').and.returnValue({ [step.id]: [] });
    spyOn(objectives, 'stepRecipes').and.returnValue({
      [step.id]: {
        ids: [step.recipeId!],
        enabledIds: [step.recipeId!],
        options: [],
      },
    });
    const fixture = TestBed.createComponent(Steps);
    fixture.componentInstance['preferencesStore'].apply({
      columns: {
        ...initialColumnsState,
        tree: { ...initialColumnsState.tree, show: true },
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector(
      'tbody tr',
    );
    expect(row?.querySelectorAll('lab-exclude-button').length).toBe(2);
    expect(row?.querySelector('lab-recipes-select lab-icon')).not.toBeNull();
  });

  it('clears defaulted module and beacon overrides without creating an ordinary objective', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Steps],
      providers: [
        {
          provide: EFFECTIVE_DEFAULTS,
          useValue: {
            ...upstreamProduct.defaults(),
            extension: createEndfieldState(),
          },
        },
        {
          provide: PRESENTATION_EXTENSION,
          useFactory: (): PresentationExtension =>
            createEndfieldPresentation(inject(EndfieldStore)),
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Steps);
    const component = fixture.componentInstance;
    const store = TestBed.inject(EndfieldStore);
    const step = {
      ...TestBed.inject(Mocks).step1(),
      recipeObjectiveId: resourceObjectiveId('iron_ore'),
      recipeSettings: { machineId: ItemId.AssemblingMachine3 },
    };
    store.updateRecipeField('iron_ore', 'modules', [{ id: 'module' }]);
    store.updateRecipeField('iron_ore', 'beacons', [{ id: 'beacon' }]);
    spyOn(component['hydration'], 'dehydrateModules').and.returnValue(
      undefined,
    );
    spyOn(component['hydration'], 'dehydrateBeacons').and.returnValue(
      undefined,
    );
    component.changeModulesBeacons(step, { modules: [{ id: 'module' }] });
    expect(
      store.snapshot().resourceRecipeSettings.iron_ore?.modules,
    ).toBeUndefined();
    expect(store.snapshot().resourceRecipeSettings.iron_ore?.beacons).toEqual([
      { id: 'beacon' },
    ]);
    component.changeModulesBeacons(step, { beacons: [{ id: 'beacon' }] });
    expect(store.snapshot().resourceRecipeSettings.iron_ore).toBeUndefined();
    expect(
      component['objectivesStore'].state()[resourceObjectiveId('iron_ore')],
    ).toBeUndefined();
  });
});
