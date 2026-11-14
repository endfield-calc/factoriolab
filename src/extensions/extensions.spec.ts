import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { DEFAULT_MOD } from '~/data/datasets';
import { createEndfieldProduct } from '~/endfield/product/product';
import {
  editorGuard,
  endfieldIdGuard as idGuard,
  endfieldLandingGuard as landingGuard,
} from '~/endfield/providers';
import { rational } from '~/rational/rational';
import { initialPreferencesState } from '~/state/preferences/preferences-state';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { RouterSync } from '~/state/router/router-sync';
import { initialSettingsState } from '~/state/settings/settings-state';
import { MockComponent } from '~/tests/mocks/component';
import { TestModule } from '~/tests/test-module';

import {
  CALCULATION_EXTENSION,
  emptyModelRules,
} from './calculation-extension';
import { immutableValue, mutableValue } from './immutable';
import { PRESENTATION_EXTENSION } from './presentation-extension';
import {
  cloneDefaults,
  EFFECTIVE_DEFAULTS,
  PRODUCT_PROFILE,
  upstreamProduct,
} from './product-profile';
import { STATE_EXTENSION, WorkspaceRestoreError } from './state-extension';
import { WorkspaceLifecycle } from './workspace-lifecycle';

describe('Neutral extension defaults', () => {
  it('uses the unmodified upstream defaults without product providers', () => {
    expect(TestBed.inject(PRODUCT_PROFILE)).toBe(upstreamProduct);
    const defaults = TestBed.inject(EFFECTIVE_DEFAULTS);
    expect(cloneDefaults(defaults).settings).toEqual(initialSettingsState);
    expect(cloneDefaults(defaults).preferences).toEqual(
      initialPreferencesState,
    );
    expect(defaults.settings).not.toBe(initialSettingsState);
    expect(defaults.preferences).not.toBe(initialPreferencesState);
  });

  it('isolates mutable nested defaults from state edits and subsequent resets', () => {
    const snapshot = upstreamProduct.defaults();
    const state = cloneDefaults(snapshot);
    state.settings.checkedItemIds.add('edited');
    state.preferences.columns.items.show =
      !snapshot.preferences.columns.items.show;
    state.preferences.states['test'] = { saved: '?o=test' };
    state.preferences.flowSettings.hideExcluded =
      !snapshot.preferences.flowSettings.hideExcluded;
    expect(cloneDefaults(snapshot)).toEqual(
      cloneDefaults(upstreamProduct.defaults()),
    );
  });

  it('provides runtime immutable sets, objects and arrays at extension boundaries', () => {
    const snapshot = immutableValue({
      selected: new Set(['original']),
      nested: { rate: 1 },
      ids: ['original'],
    });
    expect(Reflect.get(snapshot.selected, 'add')).toBeUndefined();
    expect(() => Object.assign(snapshot.nested, { rate: 2 })).toThrow();
    expect(() => Array.prototype.push.call(snapshot.ids, 'changed')).toThrow();
    expect(Array.from(snapshot.selected)).toEqual(['original']);
  });

  it('has an empty state codec and model rules by default', () => {
    const extension = TestBed.inject(STATE_EXTENSION);
    const input = { modId: 'test', params: { v: '12' } };
    expect(extension.prepare(input)).toEqual(input);
    expect(extension.snapshot()).toBeUndefined();
    expect(extension.encode(undefined)).toEqual({});
    const calculation = TestBed.inject(CALCULATION_EXTENSION);
    expect(calculation.rules({} as never, [])).toBe(emptyModelRules);
    expect(calculation.derive({} as never)).toEqual([]);
    expect(extension.preflight({} as never)).toEqual([]);
    expect(TestBed.inject(PRESENTATION_EXTENSION).mainPanels).toEqual([]);
  });

  it('keeps the read-only Set contract and isolates results of set operations', () => {
    const set = immutableValue(new Set(['a', 'b']));
    expect(set.size).toBe(2);
    expect([...set.entries()]).toEqual([
      ['a', 'a'],
      ['b', 'b'],
    ]);
    expect([...set.keys()]).toEqual(['a', 'b']);
    expect([...set.values()]).toEqual(['a', 'b']);
    expect(set.union(new Set(['c']))).toEqual(new Set(['a', 'b', 'c']));
    expect(set.intersection(new Set(['b', 'c']))).toEqual(new Set(['b']));
    expect(set.difference(new Set(['b']))).toEqual(new Set(['a']));
    expect(set.symmetricDifference(new Set(['b', 'c']))).toEqual(
      new Set(['a', 'c']),
    );
    expect(set.isSubsetOf(new Set(['a', 'b', 'c']))).toBeTrue();
    expect(set.isSupersetOf(new Set(['b']))).toBeTrue();
    expect(set.isDisjointFrom(new Set(['c']))).toBeTrue();
    const context = { values: [] as string[] };
    set.forEach(function (this: typeof context, first, second, readonlySet) {
      expect(first).toBe(second);
      expect(readonlySet).toBe(set);
      expect(Reflect.get(readonlySet, 'delete')).toBeUndefined();
      this.values.push(first);
    }, context);
    expect(context.values).toEqual(['a', 'b']);
    const union = set.union(new Set(['c']));
    union.clear();
    expect([...set]).toEqual(['a', 'b']);
    const value = { rate: rational(7), owners: [new Set(['a'])] };
    const copy = mutableValue<typeof value>(immutableValue(value));
    copy.owners[0].add('b');
    expect(value.owners[0]).toEqual(new Set(['a']));
    expect(copy.rate).not.toBe(value.rate);
    expect(copy.rate.eq(value.rate)).toBeTrue();
  });

  it('does not acquire editing or ownership effects from the default presentation', () => {
    const presentation = TestBed.inject(PRESENTATION_EXTENSION);
    expect(presentation.costsModified()).toBeFalse();
    presentation.resetCosts();
    const owner = { kind: 'objective', id: '1' } as const;
    expect(presentation.showNames()).toBeFalse();
    presentation.toggleNames();
    expect(presentation.showNames()).toBeFalse();
    expect(presentation.hideDuplicateIcons()).toBeFalse();
    expect(presentation.hideProducer('recipe')).toBeFalse();
    expect(presentation.forceLabel('recipe')).toBeFalse();
    expect(presentation.owner({ id: '1' })).toBeUndefined();
    expect(
      presentation.updateRecipeField(owner, 'cost', rational.one),
    ).toBeFalse();
    expect(presentation.resetRecipe(owner)).toBeFalse();
    expect(presentation.checked({ id: '1' })).toBeUndefined();
    expect(presentation.toggleChecked({ id: '1' }, true)).toBeFalse();
    presentation.clearChecked();
    expect(presentation.hasChecked()).toBeFalse();
    expect(presentation.modified(owner)).toBeFalse();
    presentation.resetRecipes(['cost']);
    expect(presentation.sourceLabel({ id: '1' })).toBeUndefined();
    expect(presentation.workspaceLink({ id: '1' })).toBeFalse();
    expect(presentation.stepFragment({ id: '1' })).toBeUndefined();
    const state = TestBed.inject(STATE_EXTENSION);
    state.commit({ extra: 'ignored' });
    state.reset();
    expect(state.snapshot()).toBeUndefined();
  });

  it('isolates and freezes Rational values without mutating shared constants', () => {
    const original = rational.one;
    const snapshot = immutableValue({ value: original });
    expect(snapshot.value).not.toBe(original);
    expect(snapshot.value.eq(original)).toBeTrue();
    expect(() => Object.assign(snapshot.value, { p: 2n })).toThrow();
    expect(original.p).toBe(1n);
    expect(snapshot.value.mul(rational(2)).toString()).toBe('2');
  });

  it('retains structured restore errors', () => {
    const diagnostic = {
      code: 'version',
      message: 'Unsupported version',
      severity: 'error',
    } as const;
    const error = new WorkspaceRestoreError([diagnostic]);
    expect(error.message).toBe(diagnostic.message);
    expect(error.diagnostics).toEqual([diagnostic]);
  });
});

describe('Workspace recovery lifecycle', () => {
  it('rejects obsolete navigation completions and errors', () => {
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    const old = lifecycle.begin('?old');
    const current = lifecycle.begin('?current');
    expect(lifecycle.complete(old)).toBeFalse();
    lifecycle.fail(old, [
      { code: 'old', message: 'obsolete', severity: 'error' },
    ]);
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.diagnostics()).toEqual([]);
    expect(lifecycle.originalInput()).toBe('?current');
    expect(lifecycle.complete(current)).toBeTrue();
    expect(lifecycle.ready()).toBeTrue();
  });

  it('keeps failed input and blocks writeback until a valid restoration', () => {
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    const ticket = lifecycle.begin('?invalid');
    lifecycle.fail(ticket, [
      { code: 'decode', message: 'Invalid input', severity: 'error' },
    ]);
    expect(lifecycle.ready()).toBeFalse();
    expect(lifecycle.originalInput()).toBe('?invalid');
    expect(lifecycle.diagnostics()[0].code).toBe('decode');
    lifecycle.complete(lifecycle.begin('?valid'));
    expect(lifecycle.ready()).toBeTrue();
    expect(lifecycle.diagnostics()).toEqual([]);
  });

  it('cannot mark an error diagnostic as a successful restoration', () => {
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    expect(
      lifecycle.complete(lifecycle.begin('?invalid'), [
        { code: 'invalid', message: 'Invalid', severity: 'error' },
      ]),
    ).toBeFalse();
    expect(lifecycle.ready()).toBeFalse();
  });
});

describe('product route restrictions', () => {
  let router: Router;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(false, 'zh'),
        },
        provideRouter([
          {
            path: 'editor',
            canActivate: [editorGuard],
            component: MockComponent,
          },
          {
            path: ':id',
            canActivate: [idGuard],
            children: [
              { path: '', pathMatch: 'full', component: MockComponent },
              { path: 'list', component: MockComponent },
              { path: 'flow', component: MockComponent },
              { path: 'data', component: MockComponent },
            ],
          },
        ]),
      ],
    });
    router = TestBed.inject(Router);
  });

  it('keeps every query parameter for allowed and legacy shortcut routes', async () => {
    const harness = await RouterTestingHarness.create(
      '/aef/list?v=11&o=a&o=b&cet=x&z=abc',
    );
    expect(router.url).toBe('/aef/list?v=11&o=a&o=b&cet=x&z=abc');
    await harness.navigateByUrl('/flow?v=11&o=a&o=b&cet=x&z=abc');
    expect(router.url).toBe('/aef/flow?v=11&o=a&o=b&cet=x&z=abc');
    await harness.navigateByUrl('/data?v=11&o=a&o=b');
    expect(router.url).toBe('/aef/data?v=11&o=a&o=b');
  });

  it('redirects other games, custom data and editor without their queries', async () => {
    const harness = await RouterTestingHarness.create(
      '/2x1/list?v=11&o=foreign',
    );
    expect(router.url).toBe('/aef');
    await harness.navigateByUrl('/cst/list?v=11&o=foreign');
    expect(router.url).toBe('/aef');
    await harness.navigateByUrl('/editor?v=11&o=foreign');
    expect(router.url).toBe('/aef');
  });
});

describe('upstream editor capability', () => {
  it('allows the editor without a product provider', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'editor',
            canActivate: [editorGuard],
            component: MockComponent,
          },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    await RouterTestingHarness.create('/editor?x=1');
    expect(router.url).toBe('/editor?x=1');
  });
});

describe('restricted product without a default mod', () => {
  it('routes legacy shortcuts to the upstream default while retaining the query', async () => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: {
            ...upstreamProduct,
            allowEditor: false,
            allowedModIds: [DEFAULT_MOD],
          },
        },
        provideRouter([
          {
            path: 'editor',
            canActivate: [editorGuard],
            component: MockComponent,
          },
          {
            path: ':id',
            canActivate: [idGuard],
            children: [
              { path: '', pathMatch: 'full', component: MockComponent },
              { path: 'flow', component: MockComponent },
            ],
          },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    await RouterTestingHarness.create('/flow?v=11&o=coal');
    expect(router.url).toEqual(`/${DEFAULT_MOD}/flow?v=11&o=coal`);
    await router.navigateByUrl('/editor?untrusted=1');
    expect(router.url).toEqual(`/${DEFAULT_MOD}`);
  });
});

describe('landingGuard with product restriction', () => {
  let router: Router;
  let preferences: PreferencesStore;
  let routerSync: RouterSync;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(false, 'zh'),
        },
        provideRouter([
          {
            path: ':id',
            children: [
              { path: 'list', component: MockComponent },
              {
                path: '',
                pathMatch: 'full',
                canActivate: [landingGuard],
                component: MockComponent,
              },
            ],
          },
          {
            path: '',
            pathMatch: 'full',
            canActivate: [landingGuard],
            component: MockComponent,
          },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    preferences = TestBed.inject(PreferencesStore);
    routerSync = TestBed.inject(RouterSync);
  });

  it('preserves explicit root queries and ignores cached workspaces', async () => {
    spyOn(preferences, 'bypassLanding').and.returnValue(true);
    spyOn(routerSync, 'stored').and.returnValue('/aef/list?old=1');
    await RouterTestingHarness.create('/?v=11&o=a&o=b&z=abc');
    expect(router.url).toBe('/aef/list?v=11&o=a&o=b&z=abc');
  });

  it('rejects a foreign cached workspace and can resume the allowed one', async () => {
    spyOn(preferences, 'bypassLanding').and.returnValue(true);
    const stored = spyOn(routerSync, 'stored').and.returnValue(
      '/2x1/list?o=foreign',
    );
    const harness = await RouterTestingHarness.create('/');
    expect(router.url).toBe('/aef/list');
    stored.and.returnValue('/aef/list?v=11&o=a');
    await harness.navigateByUrl('/');
    expect(router.url).toBe('/aef/list?v=11&o=a');
  });

  it('retains an explicit root query even when landing is enabled', async () => {
    spyOn(preferences, 'bypassLanding').and.returnValue(false);
    await RouterTestingHarness.create('/?v=11&o=a&o=b');
    expect(router.url).toBe('/aef?v=11&o=a&o=b');
  });
});
