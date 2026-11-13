import { effect, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  EFFECTIVE_DEFAULTS,
  upstreamProduct,
} from '~/extensions/product-profile';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { rational } from '~/rational/rational';
import { SettingsStore } from '~/state/settings/settings-store';

import { createEndfieldState } from '../domain/model';
import { EndfieldCoordinator } from './coordinator';

describe('EndfieldCoordinator', () => {
  const initial = (): {
    locationIds: Set<string>;
    defaultLocationIds: Set<string>;
    excludedRecipeIds: Set<string>;
  } => ({
    locationIds: new Set(['tundra', 'jinlong']),
    defaultLocationIds: new Set(['tundra', 'jinlong']),
    excludedRecipeIds: new Set([
      'unrelated',
      'sewage-treat',
      'sewage-treat-export',
    ]),
  });
  let settings: ReturnType<typeof signal<ReturnType<typeof initial>>>;
  let coordinator: EndfieldCoordinator;
  let lifecycle: WorkspaceLifecycle;

  beforeEach(() => {
    settings = signal(initial());
    TestBed.configureTestingModule({
      providers: [
        {
          provide: EFFECTIVE_DEFAULTS,
          useValue: {
            ...upstreamProduct.defaults(),
            extension: createEndfieldState(),
          },
        },
        {
          provide: SettingsStore,
          useValue: {
            settings,
            dataset: signal({}),
            apply: (patch: Partial<ReturnType<typeof initial>>): void => {
              settings.update((s) => ({ ...s, ...patch }));
            },
          },
        },
      ],
    });
    coordinator = TestBed.inject(EndfieldCoordinator);
    lifecycle = TestBed.inject(WorkspaceLifecycle);
  });

  it('presents one coherent snapshot after a cross-store preset', () => {
    const observations: string[] = [];
    TestBed.runInInjectionContext(() =>
      effect(() => {
        observations.push(
          `${String(coordinator.state().resourceLimits.enabled)}:${[...settings().locationIds].join(',')}:${settings().excludedRecipeIds.size}`,
        );
      }),
    );
    TestBed.tick();
    expect(
      coordinator.dispatch({ type: 'preset', preset: 'jinlong' }),
    ).toBeTrue();
    TestBed.tick();
    expect(observations).toEqual(['false:tundra,jinlong:3', 'true:jinlong:1']);
    expect(
      coordinator.state().resourceLimits.rates.copper_ore.eq(rational(510, 60)),
    ).toBeTrue();
    expect(settings().excludedRecipeIds).toEqual(new Set(['unrelated']));
  });

  it('rejects edits while restoring and keeps both snapshots on invalid commands', () => {
    const before = coordinator.state();
    const settingsBefore = settings();
    const ticket = lifecycle.begin('?v=11');
    expect(
      coordinator.dispatch({ type: 'preset', preset: 'jinlong' }),
    ).toBeFalse();
    expect(coordinator.state()).toBe(before);
    expect(settings()).toBe(settingsBefore);
    lifecycle.complete(ticket);
    expect(
      coordinator.dispatch({ type: 'electric', value: rational(-1) }),
    ).toBeFalse();
    expect(coordinator.diagnostics()[0].code).toBe('invalid-value');
    expect(coordinator.state()).toBe(before);
    expect(settings()).toBe(settingsBefore);
    expect(
      coordinator.dispatch({ type: 'resourceEnabled', enabled: true }),
    ).toBeTrue();
    expect(coordinator.diagnostics()).toEqual([]);
    expect(coordinator.state().resourceLimits.enabled).toBeTrue();
  });
});
