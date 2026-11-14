import {
  provideZonelessChangeDetection,
  signal,
  WritableSignal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SwUpdate,
  UnrecoverableStateEvent,
  VersionEvent,
} from '@angular/service-worker';
import { select } from 'd3';
import ELK from 'elkjs';
import { of, Subject } from 'rxjs';

import { App } from '~/app/app';
import { Flow, SVG_ID } from '~/app/main/flow/flow';
import { Main } from '~/app/main/main';
import { FlowBuilder } from '~/flow/flow-builder';
import { FlowData } from '~/flow/flow-data';
import { FlowDiagram } from '~/state/preferences/flow-diagram';
import {
  FlowSettings,
  initialFlowSettings,
} from '~/state/preferences/flow-settings';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { WorkspaceLifecycle } from '~/state/workspace-lifecycle';
import { Mocks } from '~/tests/mocks/mocks';
import { TestModule } from '~/tests/test-module';
import { assert } from '~/tests/utils';
import { spread } from '~/utils/object';

const sankeySettings = { ...initialFlowSettings, diagram: FlowDiagram.Sankey };

describe('workspace recovery interaction', () => {
  it('disables workspace editors until ready but leaves the header and panels usable', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Main],
    }).compileComponents();
    const fixture = TestBed.createComponent(Main);
    const lifecycle = TestBed.inject(WorkspaceLifecycle);
    const ticket = lifecycle.begin('/aef/list?z=bad');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(
      host.querySelector('aside[labSettings]')?.hasAttribute('inert'),
    ).toBeTrue();
    expect(
      host.querySelector('lab-objectives')?.hasAttribute('inert'),
    ).toBeTrue();
    expect(
      host.querySelector('router-outlet')?.parentElement?.hasAttribute('inert'),
    ).toBeTrue();
    expect(host.querySelector('header')?.hasAttribute('inert')).toBeFalse();
    lifecycle.complete(ticket);
    fixture.detectChanges();
    expect(
      host.querySelector('aside[labSettings]')?.hasAttribute('inert'),
    ).toBeFalse();
    expect(
      host.querySelector('lab-objectives')?.hasAttribute('inert'),
    ).toBeFalse();
    expect(
      host.querySelector('router-outlet')?.parentElement?.hasAttribute('inert'),
    ).toBeFalse();
  });
});

describe('App update recovery', () => {
  let component: App;
  let fixture: ComponentFixture<App>;

  const swUpdate = {
    unrecoverable: new Subject<UnrecoverableStateEvent>(),
    versionUpdates: new Subject<VersionEvent>(),
  };
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, App],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SwUpdate, useValue: swUpdate },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(App);
    component = fixture.componentInstance;
    spyOn<any, any>(component, 'log');
    fixture.detectChanges();
  });
  it('keeps upstream update behavior without download or installation-failure prompts', () => {
    spyOn(component['windowClient'], 'reload');
    spyOn(component['confirm'], 'open').and.returnValue(of(true));
    swUpdate.versionUpdates.next({ type: 'VERSION_DETECTED' } as any);
    swUpdate.versionUpdates.next({
      type: 'VERSION_INSTALLATION_FAILED',
    } as any);
    expect(component['confirm'].open).not.toHaveBeenCalled();
    expect(component['windowClient'].reload).not.toHaveBeenCalled();
  });
  it('keeps a ready update deferred when its refresh is cancelled', () => {
    spyOn(component['windowClient'], 'reload');
    spyOn(component['confirm'], 'open').and.returnValue(of(false));
    swUpdate.versionUpdates.next({ type: 'VERSION_READY' } as any);
    expect(component['windowClient'].reload).not.toHaveBeenCalled();
  });
  it('requires a refresh for unrecoverable state', () => {
    spyOn(component['windowClient'], 'reload');
    spyOn(component['confirm'], 'open').and.returnValue(of(true));
    swUpdate.unrecoverable.next({} as any);
    expect(component['confirm'].open).toHaveBeenCalledWith(
      jasmine.objectContaining({ header: 'app.updateRequired' }),
    );
    expect(component['windowClient'].reload).toHaveBeenCalledTimes(1);
  });
});

describe('Flow recovery and source labels', () => {
  let component: Flow;
  let fixture: ComponentFixture<Flow>;
  let mocks: Mocks;
  let liveFlow: WritableSignal<FlowData | null>;
  let liveSettings: WritableSignal<FlowSettings>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Flow],
    }).compileComponents();

    mocks = TestBed.inject(Mocks);
    liveFlow = signal<FlowData | null>(null);
    liveSettings = signal(sankeySettings);
    spyOn(TestBed.inject(FlowBuilder), 'flowData').and.callFake(liveFlow);
    spyOn(TestBed.inject(PreferencesStore), 'flowSettings').and.callFake(
      liveSettings,
    );
    fixture = TestBed.createComponent(Flow);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  const boxSettings = spread(initialFlowSettings, {
    diagram: FlowDiagram.BoxLine,
  });
  function namedFlow(name: string): FlowData {
    const flow = mocks.flow();
    return {
      ...flow,
      nodes: flow.nodes.map((node, index) => ({
        ...node,
        name: `${name}-${index}`,
      })),
    };
  }
  function delayedLayouts(): {
    complete(index: number): Promise<void>;
    count(): number;
    started(index: number): Promise<void>;
  } {
    const pending: (() => Promise<void>)[] = [];
    const starts: (() => void)[] = [];
    const realElk = new ELK();
    spyOn(component['elk'], 'layout').and.callFake((graph) => {
      const layout = realElk.layout(graph);
      return new Promise((resolve) => {
        pending.push(async (): Promise<void> => {
          resolve(await layout);
        });
        starts[pending.length - 1]?.();
      });
    });
    return {
      count: (): number => pending.length,
      started: (index): Promise<void> =>
        pending[index] != null
          ? Promise.resolve()
          : new Promise((resolve) => {
              starts[index] = resolve;
            }),
      complete: async (index): Promise<void> => {
        await pending[index]();
      },
    };
  }
  function container(): HTMLElement {
    const host = fixture.nativeElement as HTMLElement;
    const element = host.querySelector<HTMLElement>(`#${SVG_ID}`);
    assert(element != null);
    return element;
  }
  function labeledFlow(): FlowData {
    const flow = mocks.flow();
    return {
      ...flow,
      nodes: flow.nodes.map((node, index) =>
        index === 0
          ? {
              ...node,
              stepId: 'derived-step',
              recipeObjectiveId: 'ef:resource:iron_ore',
              recipeIcon: undefined,
              objectiveLabel: 'Resource supply',
            }
          : index === 1
            ? { ...node, recipeObjectiveId: '42', objectiveLabel: '#42' }
            : node,
      ),
    };
  }
  function expectSafeLabelsAndSelection(): void {
    const element = container();
    expect(element.textContent).toContain('Resource supply');
    expect(element.textContent).toContain('#42');
    expect(element.textContent).not.toContain('ef:resource:');
    const title = Array.from(element.querySelectorAll('title')).find(
      (item) => item.textContent === 'r|0',
    );
    assert(title != null);
    title.parentElement?.parentElement?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(component['selectedId']()).toBe('derived-step');
  }
  describe('rebuildChart', () => {
    it('only removes content belonging to this flow component', async () => {
      const other = TestBed.createComponent(Flow);
      other.detectChanges();
      const otherContainer: HTMLElement = other.nativeElement.querySelector(
        `#${SVG_ID}`,
      );
      otherContainer.append(document.createElement('span'));
      await component.rebuildChart(null, initialFlowSettings);
      expect(otherContainer.querySelector('span')).not.toBeNull();
      other.destroy();
    });
    it('ignores an older layout for the same inputs after a newer layout', async () => {
      const layouts = delayedLayouts();
      liveFlow.set(namedFlow('current'));
      liveSettings.set(boxSettings);
      fixture.detectChanges();
      await layouts.started(0);
      const current = liveFlow()!;
      liveFlow.set({ ...current });
      liveFlow.set(current);
      fixture.detectChanges();
      await layouts.started(1);
      expect(layouts.count()).toBe(2);
      await layouts.complete(1);
      await layouts.complete(0);
      await Promise.resolve();
      expect(container().querySelectorAll(':scope > svg').length).toBe(1);
      expect(container().textContent).toContain('current-0');
    });
    it('ignores an older layout after switching to Sankey', async () => {
      const layouts = delayedLayouts();
      liveFlow.set(namedFlow('old'));
      liveSettings.set(boxSettings);
      fixture.detectChanges();
      await layouts.started(0);
      const rebuildSankey = component.rebuildSankey.bind(component);
      const rendered = new Promise<void>((resolve) => {
        spyOn(component, 'rebuildSankey').and.callFake((flow, settings) => {
          rebuildSankey(flow, settings);
          resolve();
        });
      });
      liveFlow.set(namedFlow('sankey'));
      liveSettings.set(sankeySettings);
      fixture.detectChanges();
      await rendered;
      await layouts.complete(0);
      await Promise.resolve();
      expect(container().querySelectorAll(':scope > svg').length).toBe(1);
      expect(container().textContent).toContain('sankey-0');
      expect(container().textContent).not.toContain('old-0');
    });
    it('does not draw a layout that finishes after destruction', async () => {
      const layouts = delayedLayouts();
      const element = container();
      liveFlow.set(namedFlow('old'));
      liveSettings.set(boxSettings);
      fixture.detectChanges();
      await layouts.started(0);
      fixture.destroy();
      await layouts.complete(0);
      await Promise.resolve();
      await component.rebuildChart(mocks.flow(), boxSettings);
      component.rebuildSankey(mocks.flow(), sankeySettings);
      await component.rebuildBoxLine(mocks.flow(), boxSettings);
      expect(layouts.count()).toBe(1);
      expect(element.querySelector('svg')).toBeNull();
    });
    it('invalidates live input changes before the debounce or effects run', async () => {
      const layouts = delayedLayouts();
      liveFlow.set(namedFlow('old'));
      liveSettings.set(boxSettings);
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(layouts.count()).toBe(1);

      liveFlow.set(namedFlow('new'));
      await layouts.complete(0);
      await Promise.resolve();
      expect(container().querySelector('svg')).toBeNull();

      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(layouts.count()).toBe(2);
      await layouts.complete(1);
      await Promise.resolve();
      expect(container().textContent).toContain('new-0');
      expect(container().textContent).not.toContain('old-0');
    });
    it('invalidates a pending layout as soon as the live diagram changes', async () => {
      const layouts = delayedLayouts();
      liveFlow.set(namedFlow('current'));
      liveSettings.set(boxSettings);
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(layouts.count()).toBe(1);

      liveSettings.set(sankeySettings);
      await layouts.complete(0);
      expect(container().querySelector('svg')).toBeNull();

      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(container().querySelectorAll(':scope > svg').length).toBe(1);
      expect(container().textContent).toContain('current-0');
      expect(layouts.count()).toBe(1);
    });
  });
  describe('rebuildSankey', () => {
    beforeEach(() => {
      select(`#${SVG_ID} > *`).remove();
      component.rebuildSankey(mocks.flow(), sankeySettings);
    });
    it('uses safe objective labels and keeps the selected step', () => {
      select(container()).selectAll('*').remove();
      component.rebuildSankey(labeledFlow(), sankeySettings);
      expectSafeLabelsAndSelection();
    });
  });
  describe('rebuildBoxLine', () => {
    beforeEach(() => {
      select(`#${SVG_ID} > *`).remove();
    });
    it('uses safe objective labels and keeps the selected step', async () => {
      const rebuild = component.rebuildBoxLine.bind(component);
      const rendered = new Promise<void>((resolve, reject) => {
        spyOn(component, 'rebuildBoxLine').and.callFake((flow, settings) => {
          const result = rebuild(flow, settings);
          void result.then(resolve, reject);
          return result;
        });
      });
      liveFlow.set(labeledFlow());
      liveSettings.set(boxSettings);
      fixture.detectChanges();
      await rendered;
      expectSafeLabelsAndSelection();
    });
  });
});
