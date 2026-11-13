import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  createEndfieldState,
  resourceObjectiveId,
  resourceOwner,
} from '~/endfield/domain/model';
import { EndfieldDisplayPreferences } from '~/endfield/state/display-preferences';
import { EndfieldStore } from '~/endfield/state/endfield-store';
import {
  EFFECTIVE_DEFAULTS,
  upstreamProduct,
} from '~/extensions/product-profile';
import { rational } from '~/rational/rational';
import { Step } from '~/solver/step';

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
