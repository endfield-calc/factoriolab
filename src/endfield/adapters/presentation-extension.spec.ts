import { DIALOG_DATA } from '@angular/cdk/dialog';
import { inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import ELK from 'elkjs';

import { Header } from '~/app/main/header/header';
import { FlowSettingsDialog } from '~/components/flow-settings-dialog/flow-settings-dialog';
import { PickerData } from '~/components/picker/picker-data';
import { PickerDialog } from '~/components/picker/picker-dialog';
import { DetailRow } from '~/components/steps/detail-row/detail-row';
import { TotalCell } from '~/components/steps/total-cell/total-cell';
import { sankey } from '~/d3/sankey/sankey';
import {
  createEndfieldState,
  resourceObjectiveId,
  resourceOwner,
} from '~/endfield/domain/model';
import { createEndfieldProduct } from '~/endfield/product/product';
import { EndfieldDisplayPreferences } from '~/endfield/state/display-preferences';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import {
  PRESENTATION_EXTENSION,
  upstreamPresentation,
} from '~/extensions/presentation-extension';
import {
  EFFECTIVE_DEFAULTS,
  PRODUCT_PROFILE,
  upstreamProduct,
} from '~/extensions/product-profile';
import { FlowBuilder } from '~/flow/flow-builder';
import { Link } from '~/flow/link';
import { Node } from '~/flow/node';
import { rational } from '~/rational/rational';
import { Step } from '~/solver/step';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { FlowDiagram } from '~/state/preferences/flow-diagram';
import { RecipesStore } from '~/state/recipes/recipes-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { ItemId } from '~/tests/item-id';
import { Mocks } from '~/tests/mocks/mocks';
import { RecipeId } from '~/tests/recipe-id';
import { TestModule } from '~/tests/test-module';
import { setInputs } from '~/tests/utils';

import { createEndfieldPresentation } from './presentation-extension';

describe('Endfield presentation extension', () => {
  let store: EndfieldStore;
  const display = signal({ showNames: false, hideDuplicateIcons: true });
  const preferences = {
    state: display.asReadonly(),
    toggleNames: (): void => {
      display.update((value) => ({ ...value, showNames: !value.showNames }));
    },
  } as unknown as EndfieldDisplayPreferences;
  const derived: Step = {
    id: 'row',
    recipeId: 'iron_ore',
    recipeObjectiveId: resourceObjectiveId('iron_ore'),
  };
  const owner = { kind: 'extension' as const, id: resourceOwner('iron_ore') };

  beforeEach(() => {
    display.set({ showNames: false, hideDuplicateIcons: true });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: EFFECTIVE_DEFAULTS,
          useValue: {
            ...upstreamProduct.defaults(),
            extension: createEndfieldState(),
          },
        },
      ],
    });
    store = TestBed.inject(EndfieldStore);
  });

  it('keeps display preferences local and reads explicit per-recipe metadata', () => {
    const view = createEndfieldPresentation(store, preferences, [], [], {
      a: { hideProducer: true },
      b: { forceShowLabel: true },
    });
    const snapshot = store.snapshot();
    expect(view.showNames()).toBeFalse();
    view.toggleNames();
    expect(view.showNames()).toBeTrue();
    expect(view.hideDuplicateIcons()).toBeTrue();
    display.update((value) => ({ ...value, hideDuplicateIcons: false }));
    expect(view.hideDuplicateIcons()).toBeFalse();
    expect(view.hideProducer('a')).toBeTrue();
    expect(view.hideProducer('b')).toBeFalse();
    expect(view.forceLabel('b')).toBeTrue();
    expect(view.forceLabel('unknown')).toBeFalse();
    expect(store.snapshot()).toBe(snapshot);
  });

  it('resets the independent power weight without clearing resource configuration', () => {
    const view = createEndfieldPresentation(store, preferences);
    expect(view.costsModified()).toBeFalse();
    store.set({ ...store.state(), electric: rational(2) });
    expect(view.costsModified()).toBeTrue();
    const resources = store.state().resourceLimits;
    view.resetCosts();
    expect(view.costsModified()).toBeFalse();
    expect(store.state().electric.eq(rational.one)).toBeTrue();
    expect(store.state().resourceLimits).toEqual(resources);
  });

  it('routes derived ownership and selection without capturing ordinary item rows', () => {
    const view = createEndfieldPresentation(store, preferences);
    const ordinary: Step = {
      id: 'ordinary',
      recipeId: 'iron_ore',
      recipeObjectiveId: '3',
    };
    expect(view.owner(derived)).toEqual(owner);
    expect(view.owner(ordinary)).toEqual({ kind: 'objective', id: '3' });
    expect(view.sourceLabel(derived)).toBe('endfield.resources.source');
    expect(view.sourceLabel(ordinary)).toBeUndefined();
    expect(view.workspaceLink(derived)).toBeTrue();
    expect(view.workspaceLink(ordinary)).toBeFalse();
    expect(view.stepFragment(derived)).toBe('endfield-resources');
    expect(view.stepFragment(ordinary)).toBeUndefined();
    expect(view.nameToggleLabel).toBe('endfield.picker.showNames');
    expect(view.checked(derived)).toBeFalse();
    expect(view.toggleChecked(derived, true)).toBeTrue();
    expect(view.checked(derived)).toBeTrue();
    expect(view.hasChecked()).toBeTrue();
    expect(view.checked({ ...derived, itemId: 'iron_ore' })).toBeUndefined();
    expect(
      view.toggleChecked({ ...derived, itemId: 'iron_ore' }, true),
    ).toBeFalse();
    expect(view.toggleChecked(ordinary, true)).toBeFalse();
    view.clearChecked();
    expect(view.hasChecked()).toBeFalse();
  });

  it('updates and resets only the matching resource owner and fields', () => {
    const view = createEndfieldPresentation(store, preferences);
    const other = {
      kind: 'extension' as const,
      id: resourceOwner('copper_ore'),
    };
    const unknown = { kind: 'extension' as const, id: 'resource:unknown' };
    expect(view.updateRecipeField(unknown, 'machineId', 'bad')).toBeFalse();
    expect(view.resetRecipe(unknown)).toBeFalse();
    expect(view.updateRecipeField(owner, 'machineId', 'miner')).toBeTrue();
    expect(
      view.updateRecipeField(owner, 'overclock', rational(120)),
    ).toBeTrue();
    expect(
      view.updateRecipeField(other, 'overclock', rational(130)),
    ).toBeTrue();
    expect(view.modified()).toBeTrue();
    expect(view.modified(owner, ['overclock'])).toBeTrue();
    expect(view.modified(owner, ['fuelId'])).toBeFalse();
    expect(view.modified(unknown)).toBeFalse();
    view.resetRecipes(['overclock']);
    expect(view.modified(owner, ['overclock'])).toBeFalse();
    expect(store.state().resourceRecipeSettings.iron_ore?.machineId).toBe(
      'miner',
    );
    expect(store.state().resourceRecipeSettings.copper_ore).toBeUndefined();
    expect(view.resetRecipe(owner)).toBeTrue();
    expect(view.modified()).toBeFalse();
  });
});

describe('Header with a single-game product', () => {
  it('retains the configured source link and hides unavailable game and editor links', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Header],
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: {
            ...upstreamProduct,
            allowEditor: false,
            allowedModIds: ['spa'],
            sourceUrl: 'https://example.test/project',
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Header);
    setInputs(fixture, {
      preferencesOpen: false,
      settingsOpen: false,
      settingsXlHidden: false,
    });
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    expect(
      html.querySelector('a[href="https://example.test/project"]'),
    ).not.toBeNull();
    expect(html.querySelector('a[href*="discord.gg"]')).toBeNull();
    expect(html.querySelector('a[href*="ko-fi.com"]')).toBeNull();
    expect(html.querySelector('a[href="/editor"]')).toBeNull();
    expect(html.querySelector('lab-select')).toBeNull();
  });
});

describe('FlowSettingsDialog with Endfield product', () => {
  it('uses BoxLine for reset and modified', async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TestModule, FlowSettingsDialog],
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(false, 'zh'),
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(FlowSettingsDialog);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component['modified']()).toBeFalse();
    component.apply({ diagram: FlowDiagram.Sankey });
    expect(component['modified']()).toBeTrue();
    component.reset();
    expect(component['editValue']().diagram).toBe(FlowDiagram.BoxLine);
    expect(component['modified']()).toBeFalse();
    localStorage.clear();
  });
});

describe('PickerDialog name presentation', () => {
  it('toggles names while keeping a forced recipe label visible', async () => {
    PickerDialog['lastCategory'] = null;
    PickerDialog['lastQuality'] = null;
    const names = signal(false);
    const forced = signal(true);
    let recipeId = '';
    let label = '';
    await TestBed.configureTestingModule({
      imports: [TestModule, PickerDialog],
      providers: [
        {
          provide: PRESENTATION_EXTENSION,
          useValue: {
            ...upstreamPresentation,
            showNameToggle: true,
            nameToggleLabel: 'Sample name control',
            showNames: (): boolean => names(),
            toggleNames: (): void => {
              names.update((value) => !value);
            },
            forceLabel: (id: string): boolean => id === recipeId && forced(),
          },
        },
        {
          provide: DIALOG_DATA,
          useFactory: (): PickerData => {
            const data = inject(SettingsStore).dataset();
            recipeId = data.recipeIds[0];
            label = data.recipeRecord[recipeId].name;
            return { type: 'recipe', allIds: [recipeId] };
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PickerDialog);
    fixture.detectChanges();
    const button = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((element) => element.getAttribute('aria-label') === label);
    expect(button?.textContent).toContain(label);
    const checkbox = fixture.nativeElement.querySelector(
      'lab-checkbox input',
    ) as HTMLInputElement;
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Sample name control',
    );
    checkbox.click();
    fixture.detectChanges();
    expect(names()).toBeTrue();
    forced.set(false);
    fixture.detectChanges();
    expect(button?.textContent).toContain(label);
    checkbox.click();
    fixture.detectChanges();
    expect(names()).toBeFalse();
    expect(button?.textContent).not.toContain(label);
  });
});

describe('DetailRow source labels', () => {
  let component: DetailRow;
  let fixture: ComponentFixture<DetailRow>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, DetailRow],
    }).compileComponents();

    fixture = TestBed.createComponent(DetailRow);

    setInputs(fixture, {
      value: { itemId: ItemId.ElectronicCircuit, items: rational(360n) },
      leftSpan: 0,
    });
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('labels derived sources on both icons while retaining ordinary numbering', () => {
    const endfield = createEndfieldPresentation(
      {} as EndfieldStore,
      {} as EndfieldDisplayPreferences,
    );
    spyOn(component['presentation'], 'sourceLabel').and.callFake(
      endfield.sourceLabel,
    );
    const row = {
      recipeId: RecipeId.ElectronicCircuit,
      recipeObjectiveId: 'ef:resource:iron_ore',
      percent: rational.one,
      destId: RecipeId.AdvancedCircuit,
      destRecipeObjectiveId: 'ef:resource:copper_ore',
      destType: 'recipe' as const,
    };
    setInputs(fixture, { value: row });
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    expect(html.textContent).not.toContain('ef:resource:');
    expect(html.textContent?.match(/endfield\.resources\.source/g)).toHaveSize(
      2,
    );

    setInputs(fixture, {
      value: { ...row, recipeObjectiveId: '42', destRecipeObjectiveId: '51' },
    });
    fixture.detectChanges();
    expect(html.textContent).toContain('#42');
    expect(html.textContent).toContain('51');
    expect(html.textContent).not.toContain('endfield.resources.source');

    setInputs(fixture, { value: { recipeId: RecipeId.ElectronicCircuit } });
    fixture.detectChanges();
    expect(html.textContent).not.toContain('#');
  });
});

describe('TotalCell with a hidden producer', () => {
  it('excludes hidden machines while preserving power and displays machine names with fallback', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, TotalCell],
      providers: [
        {
          provide: PRESENTATION_EXTENSION,
          useValue: {
            ...upstreamPresentation,
            showNameToggle: true,
            hideProducer: (id: string): boolean => id === 'hidden-recipe',
          },
        },
      ],
    }).compileComponents();
    const store = TestBed.inject(ObjectivesStore);
    const data = TestBed.inject(RecipesStore).adjustedDataset();
    const recipe = data.adjustedRecipe[RecipeId.Coal];
    spyOn(store, 'steps').and.returnValue([
      {
        id: 'hidden',
        recipeId: 'hidden-recipe',
        recipe,
        recipeSettings: { machineId: ItemId.ElectricMiningDrill },
        machines: rational(9),
        power: rational(5),
      },
      {
        id: 'visible',
        recipeId: 'arbitrary-recipe',
        recipe,
        recipeSettings: { machineId: ItemId.ElectricMiningDrill },
        machines: rational(2),
        power: rational(-2),
      },
    ]);
    const totals = store.totals();
    expect(totals.machines[ItemId.ElectricMiningDrill].total).toEqual(
      rational(2),
    );
    expect(totals.power).toEqual(rational(3));

    const fixture = TestBed.createComponent(TotalCell);
    setInputs(fixture, { value: totals.machines });
    fixture.detectChanges();
    const expectedName =
      TestBed.inject(SettingsStore).dataset().itemRecord[
        ItemId.ElectricMiningDrill
      ].name;
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      expectedName,
    );

    setInputs(fixture, {
      value: {
        'unlisted-machine': {
          total: rational.one,
          iconType: 'item',
          tooltipType: 'machine',
        },
      },
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'unlisted-machine',
    );
  });
});

describe('FlowBuilder objective presentation', () => {
  let service: FlowBuilder;
  let mocks: Mocks;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        {
          provide: PRESENTATION_EXTENSION,
          useValue: { ...upstreamPresentation },
        },
      ],
    });
    service = TestBed.inject(FlowBuilder);
    mocks = TestBed.inject(Mocks);
  });
  it('uses recipe IDs for ordinary steps and objective IDs for objectives', () => {
    expect(service['recipeNodeId']('recipe')).toEqual('r|recipe');
    expect(service['recipeNodeId']('recipe', 'obj')).toEqual('m|obj');
    expect(service['recipeNodeId']('recipe', '')).toEqual('r|recipe');
    expect(service['recipeNodeId']('', '')).toEqual('r|');
  });
  it('keeps same-recipe objective nodes, their labels and links distinct', async () => {
    const endfield = createEndfieldPresentation(
      {} as EndfieldStore,
      {} as EndfieldDisplayPreferences,
    );
    spyOn(service['presentation'], 'sourceLabel').and.callFake(
      endfield.sourceLabel,
    );
    spyOn(service['presentation'], 'owner').and.callFake(endfield.owner);
    spyOn(service['translate'], 'get').and.returnValue('Resource supply');
    const recipeId = RecipeId.AdvancedOilProcessing;
    const derivedId = resourceObjectiveId('iron_ore');
    const parents = ['ordinary', 'target-1', 'target-2', 'derived'];
    const steps: Step[] = [
      {
        id: 'input',
        itemId: ItemId.Water,
        items: rational(4n),
        parents: Object.fromEntries(
          parents.map((id) => [id, rational(1n, 4n)]),
        ),
      },
      {
        id: 'output',
        itemId: ItemId.LightOil,
        items: rational(4n),
        output: rational(4n),
      },
      ...parents.map(
        (id, index): Step => ({
          id,
          recipeId,
          recipeObjectiveId:
            index === 0 ? undefined : index === 3 ? derivedId : `${index}`,
          outputs: { [ItemId.LightOil]: rational(1n, 4n) },
        }),
      ),
    ];
    const result = service['buildGraph'](
      steps,
      '/m',
      mocks.settingsStore.settings(),
      mocks.preferencesStore.state(),
      mocks.recipesStore.adjustedDataset(),
    );
    const recipeIds = [`r|${recipeId}`, 'm|1', 'm|2', `m|${derivedId}`];
    const nodeIds = result.nodes.map((node) => node.id);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(
      result.nodes.filter((node) => recipeIds.includes(node.id)).length,
    ).toBe(4);
    const edgeIds = result.links.map(
      ({ source, target }) => `${source}>${target}`,
    );
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
    for (const id of recipeIds) {
      expect(edgeIds).toContain(`i|${ItemId.Water}>${id}`);
      expect(edgeIds).toContain(`${id}>o|${ItemId.LightOil}`);
    }
    expect(result.nodes.find((node) => node.id === 'm|1')).toEqual(
      jasmine.objectContaining({ stepId: 'target-1', objectiveLabel: '#1' }),
    );
    expect(result.nodes.find((node) => node.id === `m|${derivedId}`)).toEqual(
      jasmine.objectContaining({
        stepId: 'derived',
        recipeObjectiveId: derivedId,
        objectiveLabel: 'Resource supply',
      }),
    );
    expect(
      result.nodes.find((node) => node.id === `r|${recipeId}`)?.objectiveLabel,
    ).toBeUndefined();

    const sankeyGraph = sankey<Node, Link>()
      .nodeId((node) => node.id)
      .nodeWidth(36)
      .extent([
        [0, 0],
        [600, 300],
      ])({
      nodes: result.nodes.map((node) => ({ ...node })),
      links: result.links.map((link) => ({ ...link })),
    });
    expect(
      sankeyGraph.links.map(
        (link) => `${(link.source as Node).id}>${(link.target as Node).id}`,
      ),
    ).toEqual(edgeIds);
    const elkGraph = await new ELK().layout({
      id: 'root',
      children: result.nodes.map((node) => ({
        ...node,
        width: 38,
        height: 38,
      })),
      edges: result.links.map((link) => ({
        id: `${link.source}>${link.target}`,
        sources: [link.source],
        targets: [link.target],
      })),
    });
    expect(elkGraph.children?.map((node) => node.id).sort()).toEqual(
      [...nodeIds].sort(),
    );
    expect(elkGraph.edges?.map((edge) => edge.id).sort()).toEqual(
      [...edgeIds].sort(),
    );
  });
  it('does not expose an extension owner ID when it has no source label', () => {
    spyOn(service['presentation'], 'owner').and.returnValue({
      kind: 'extension',
      id: 'private-owner',
    });
    const steps = mocks
      .lightOilSteps()
      .map((step) =>
        step.id === '0' ? { ...step, recipeObjectiveId: 'private-id' } : step,
      );
    const result = service['buildGraph'](
      steps,
      '/m',
      mocks.settingsStore.settings(),
      mocks.preferencesStore.state(),
      mocks.recipesStore.adjustedDataset(),
    );
    expect(
      result.nodes.find((node) => node.id === 'm|private-id')?.objectiveLabel,
    ).toBeUndefined();
  });
});
