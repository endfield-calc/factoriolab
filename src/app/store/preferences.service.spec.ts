import { TestBed } from '@angular/core/testing';

import { Game } from '~/models/enum/game';
import { Theme } from '~/models/enum/theme';
import { TestModule } from '~/tests';

import { PreferencesService } from './preferences.service';

describe('PreferencesService', () => {
  let service: PreferencesService;

  beforeEach(() => {
    localStorage.setItem('preferences', '{"theme":"black"}');
    TestBed.configureTestingModule({ imports: [TestModule] });
    service = TestBed.inject(PreferencesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load from local storage', () => {
    expect(service.state().theme).toEqual(Theme.Black);
  });

  it('adds public-supply defaults to older flow preferences and preserves an explicit off setting', () => {
    localStorage.setItem(
      'preferences',
      JSON.stringify({ flowSettings: { hideExcluded: true } }),
    );
    const legacy = TestBed.runInInjectionContext(
      () => new PreferencesService(),
    );
    expect(legacy.flowSettings().localizePublicSupplies).toBeTrue();
    expect(legacy.flowSettings().publicSupplyItemIds).toEqual(['liquid_water']);
    expect(legacy.flowSettings().hideExcluded).toBeTrue();
    localStorage.setItem(
      'preferences',
      JSON.stringify({
        flowSettings: {
          localizePublicSupplies: false,
          publicSupplyItemIds: ['liquid_acid'],
        },
      }),
    );
    const restored = TestBed.runInInjectionContext(
      () => new PreferencesService(),
    );
    expect(restored.flowSettings().localizePublicSupplies).toBeFalse();
    expect(restored.flowSettings().publicSupplyItemIds).toEqual([
      'liquid_acid',
    ]);
  });

  it('should use the sidebar defaults for previously saved preferences', () => {
    expect(service.state().settingsSections).toEqual({
      saved: true,
      recipes: true,
    });
  });

  it('should restore open and closed sections without changing other preferences', () => {
    service.apply({
      settingsSections: {
        recipes: false,
        saved: true,
        display: false,
        other: true,
      },
    });
    service.apply({ theme: Theme.Dark });
    TestBed.flushEffects();

    const restored = TestBed.runInInjectionContext(
      () => new PreferencesService(),
    );
    expect(restored.state().settingsSections).toEqual({
      recipes: false,
      saved: true,
      display: false,
      other: true,
    });
    expect(restored.state().theme).toEqual(Theme.Dark);
  });

  for (const section of ['calculation', 'display', 'interface']) {
    it(`should migrate an expanded legacy ${section} section`, () => {
      localStorage.setItem(
        'preferences',
        JSON.stringify({
          settingsSections: {
            common: false,
            saved: true,
            more: false,
            [section]: true,
          },
        }),
      );
      const restored = TestBed.runInInjectionContext(
        () => new PreferencesService(),
      );
      expect(restored.state().settingsSections).toEqual({
        recipes: false,
        saved: true,
        display: section !== 'calculation',
        other: section === 'calculation',
      });
    });
  }

  it('should preserve closed legacy sections', () => {
    localStorage.setItem(
      'preferences',
      JSON.stringify({
        settingsSections: {
          calculation: false,
          display: false,
          interface: false,
          more: false,
        },
      }),
    );
    const restored = TestBed.runInInjectionContext(
      () => new PreferencesService(),
    );
    expect(restored.state().settingsSections).toEqual({
      saved: true,
      recipes: true,
      display: false,
      other: false,
    });
  });

  it('should migrate the previous three groups and preserve the saved section', () => {
    localStorage.setItem(
      'preferences',
      JSON.stringify({
        settingsSections: { common: false, saved: true, more: true },
      }),
    );
    const restored = TestBed.runInInjectionContext(
      () => new PreferencesService(),
    );
    expect(restored.state().settingsSections).toEqual({
      recipes: false,
      saved: true,
      display: true,
      other: true,
    });
  });

  describe('saveState', () => {
    it('should save the state', () => {
      service.saveState(Game.Factorio, 'id', 'value');
      expect(service.state().states[Game.Factorio]['id']).toEqual('value');
    });
  });

  describe('removeState', () => {
    it('should remove the state', () => {
      service.saveState(Game.Factorio, 'id', 'value');
      service.removeState(Game.Factorio, 'id');
      expect(service.state().states[Game.Factorio]['id']).toBeUndefined();
    });
  });
});

describe('PreferencesService Error', () => {
  beforeEach(() => {
    localStorage.setItem('preferences', '{');
    spyOn(console, 'warn');
    TestBed.configureTestingModule({ imports: [TestModule] });
    TestBed.inject(PreferencesService);
  });

  it('should generate a warning', () => {
    expect(console.warn).toHaveBeenCalled();
  });
});
