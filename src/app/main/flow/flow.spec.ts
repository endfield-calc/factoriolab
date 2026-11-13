import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { select } from 'd3';
import ELK from 'elkjs';

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
import {
  altClickSelector,
  assert,
  dragAndDropSelector,
  zoomSelector,
} from '~/tests/utils';
import { spread } from '~/utils/object';

import { Flow, SVG_ID } from './flow';

describe('Flow', () => {
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

  it('should create', () => {
    expect(component).toBeTruthy();
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
    it('should call to rebuild the sankey', async () => {
      spyOn(component, 'rebuildSankey');
      await component.rebuildChart(mocks.flow(), initialFlowSettings);
      expect(component.rebuildSankey).toHaveBeenCalledWith(
        mocks.flow(),
        initialFlowSettings,
      );
    });

    it('should call to rebuild the box-line', async () => {
      spyOn(component, 'rebuildBoxLine');
      const flow = mocks.flow();
      const flowSettings = spread(initialFlowSettings, {
        diagram: FlowDiagram.BoxLine,
      });
      await component.rebuildChart(flow, flowSettings);
      expect(component.rebuildBoxLine).toHaveBeenCalledWith(flow, flowSettings);
    });

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

    it('should build the sankey', () => {
      const gElements = document.getElementsByTagName('g');
      expect(gElements.length).toEqual(8);
    });

    it('uses safe objective labels and keeps the selected step', () => {
      select(container()).selectAll('*').remove();
      component.rebuildSankey(labeledFlow(), initialFlowSettings);
      expectSafeLabelsAndSelection();
    });

    it('should handle drag and drop', () => {
      dragAndDropSelector(fixture, '#lab-flow-svg svg svg', 100, 200);
      assert(component['svg'] != null);
      expect(component['svg'].select('svg').attr('transform')).toBeTruthy();
    });

    it('should handle zoom', () => {
      zoomSelector(fixture, '#lab-flow-svg > svg', 500);
      assert(component['svg'] != null);
      expect(component['svg'].select('svg > g').attr('transform')).toBeTruthy();
    });

    it('should set selectedId when a rect is clicked', () => {
      altClickSelector(fixture, '#lab-flow-svg svg svg');
      expect(component['selectedId']()).toEqual(mocks.flow().nodes[0].stepId);
    });

    it('should not set selectedId when default is prevented', () => {
      spyOn(component['selectedId'], 'set');
      altClickSelector(fixture, '#lab-flow-svg svg svg', 0, true);
      expect(component['selectedId'].set).not.toHaveBeenCalled();
    });
  });

  describe('rebuildBoxLine', () => {
    beforeEach(() => {
      select(`#${SVG_ID} > *`).remove();
    });

    it('should build the box-line', async () => {
      await component.rebuildBoxLine(mocks.flow(), initialFlowSettings);
      const gElements = document.getElementsByTagName('g');
      expect(gElements.length).toEqual(8);
    });

    it('uses safe objective labels and keeps the selected step', async () => {
      await component.rebuildBoxLine(labeledFlow(), boxSettings);
      expectSafeLabelsAndSelection();
    });

    it('should exit early if result is invalid', async () => {
      spyOn(component['elk'], 'layout').and.returnValue(
        Promise.resolve({ children: [], edges: [], width: 1 }),
      );
      await component.rebuildBoxLine(mocks.flow(), initialFlowSettings);
      const gElements = document.getElementsByTagName('g');
      expect(gElements.length).toEqual(0);
    });

    it('should handle drag and drop', async () => {
      await component.rebuildBoxLine(mocks.flow(), initialFlowSettings);
      assert(component['svg'] != null);
      const movingEl = component['svg'].select('svg');
      const x = movingEl.attr('x');
      const y = movingEl.attr('y');
      dragAndDropSelector(fixture, '#lab-flow-svg svg svg', 100, 200);
      expect(movingEl.attr('x')).not.toEqual(x);
      expect(movingEl.attr('y')).not.toEqual(y);
    });

    it('should handle zoom', async () => {
      await component.rebuildBoxLine(mocks.flow(), initialFlowSettings);
      zoomSelector(fixture, '#lab-flow-svg > svg', 500);
      assert(component['svg'] != null);
      expect(component['svg'].select('svg > g').attr('transform')).toBeTruthy();
    });

    it('should set selectedId when a rect is clicked', async () => {
      await component.rebuildBoxLine(mocks.flow(), initialFlowSettings);
      altClickSelector(fixture, '#lab-flow-svg svg svg');
      expect(component['selectedId']()).toEqual(mocks.flow().nodes[0].stepId);
    });

    it('should not set selectedId when default is prevented', async () => {
      await component.rebuildBoxLine(mocks.flow(), initialFlowSettings);
      spyOn(component['selectedId'], 'set');
      altClickSelector(fixture, '#lab-flow-svg svg svg', 0, true);
      expect(component['selectedId'].set).not.toHaveBeenCalled();
    });
  });
});
