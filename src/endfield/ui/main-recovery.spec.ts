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
import { environment } from '~/environments/environment';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { FlowBuilder } from '~/flow/flow-builder';
import { FlowData } from '~/flow/flow-data';
import { FlowDiagram } from '~/state/preferences/flow-diagram';
import {
  FlowSettings,
  initialFlowSettings,
} from '~/state/preferences/flow-settings';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { Mocks } from '~/tests/mocks/mocks';
import { TestModule } from '~/tests/test-module';
import { assert } from '~/tests/utils';
import { spread } from '~/utils/object';

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
  it('notifies about a detected download without reloading the workspace', () => {
    spyOn(component['windowClient'], 'reload');
    spyOn(component['confirm'], 'open').and.returnValue(of(true));
    swUpdate.versionUpdates.next({ type: 'VERSION_DETECTED' } as any);
    expect(component['confirm'].open).toHaveBeenCalledWith(
      jasmine.objectContaining({ header: 'app.updateDetected' }),
    );
    expect(component['windowClient'].reload).not.toHaveBeenCalled();
  });
  it('keeps a ready update deferred when its refresh is cancelled', () => {
    spyOn(component['windowClient'], 'reload');
    spyOn(component['confirm'], 'open').and.returnValue(of(false));
    swUpdate.versionUpdates.next({ type: 'VERSION_READY' } as any);
    expect(component['windowClient'].reload).not.toHaveBeenCalled();
  });
  it('offers a production refresh after installation fails and requires refresh for unrecoverable state', () => {
    const original = environment.production;
    spyOn(component['windowClient'], 'reload');
    spyOn(component['confirm'], 'open').and.returnValue(of(true));
    try {
      environment.production = false;
      swUpdate.versionUpdates.next({
        type: 'VERSION_INSTALLATION_FAILED',
      } as any);
      expect(component['confirm'].open).not.toHaveBeenCalled();
      environment.production = true;
      swUpdate.versionUpdates.next({
        type: 'VERSION_INSTALLATION_FAILED',
      } as any);
      expect(component['confirm'].open).toHaveBeenCalledWith(
        jasmine.objectContaining({ header: 'app.updateRequired' }),
      );
      expect(component['windowClient'].reload).toHaveBeenCalledTimes(1);
      swUpdate.unrecoverable.next({} as any);
      expect(component['windowClient'].reload).toHaveBeenCalledTimes(2);
    } finally {
      environment.production = original;
    }
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
    liveSettings = signal(initialFlowSettings);
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
  } {
    const pending: (() => Promise<void>)[] = [];
    const realElk = new ELK();
    spyOn(component['elk'], 'layout').and.callFake((graph) => {
      const layout = realElk.layout(graph);
      return new Promise((resolve) => {
        pending.push(async (): Promise<void> => {
          resolve(await layout);
        });
      });
    });
    return {
      count: (): number => pending.length,
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
    it('ignores an older layout that completes after a newer layout', async () => {
      const layouts = delayedLayouts();
      const oldRender = component.rebuildChart(namedFlow('old'), boxSettings);
      const newRender = component.rebuildChart(namedFlow('new'), boxSettings);
      expect(layouts.count()).toBe(2);
      await layouts.complete(1);
      await newRender;
      await layouts.complete(0);
      await oldRender;
      expect(container().querySelectorAll(':scope > svg').length).toBe(1);
      expect(container().textContent).toContain('new-0');
      expect(container().textContent).not.toContain('old-0');
    });
    it('ignores an older layout after switching to Sankey', async () => {
      const layouts = delayedLayouts();
      const oldRender = component.rebuildChart(namedFlow('old'), boxSettings);
      await component.rebuildChart(namedFlow('sankey'), initialFlowSettings);
      await layouts.complete(0);
      await oldRender;
      expect(container().querySelectorAll(':scope > svg').length).toBe(1);
      expect(container().textContent).toContain('sankey-0');
      expect(container().textContent).not.toContain('old-0');
    });
    it('does not draw a layout that finishes after destruction', async () => {
      const layouts = delayedLayouts();
      const element = container();
      const render = component.rebuildChart(namedFlow('old'), boxSettings);
      fixture.destroy();
      await layouts.complete(0);
      await render;
      await component.rebuildChart(mocks.flow(), boxSettings);
      component.rebuildSankey(mocks.flow(), initialFlowSettings);
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

      liveSettings.set(initialFlowSettings);
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
      component.rebuildSankey(mocks.flow(), initialFlowSettings);
    });
    it('uses safe objective labels and keeps the selected step', () => {
      select(container()).selectAll('*').remove();
      component.rebuildSankey(labeledFlow(), initialFlowSettings);
      expectSafeLabelsAndSelection();
    });
  });
  describe('rebuildBoxLine', () => {
    beforeEach(() => {
      select(`#${SVG_ID} > *`).remove();
    });
    it('uses safe objective labels and keeps the selected step', async () => {
      await component.rebuildBoxLine(labeledFlow(), boxSettings);
      expectSafeLabelsAndSelection();
    });
  });
});
