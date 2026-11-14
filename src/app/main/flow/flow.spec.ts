import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { select } from 'd3';

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

  describe('rebuildChart', () => {
    it('should call to rebuild the sankey', async () => {
      spyOn(component, 'rebuildSankey');
      const settings = { ...initialFlowSettings, diagram: FlowDiagram.Sankey };
      await component.rebuildChart(mocks.flow(), settings);
      expect(component.rebuildSankey).toHaveBeenCalledWith(
        mocks.flow(),
        settings,
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

    async function renderBoxLine(): Promise<void> {
      const rebuild = component.rebuildBoxLine.bind(component);
      const rendered = new Promise<void>((resolve, reject) => {
        spyOn(component, 'rebuildBoxLine').and.callFake((flow, settings) => {
          const result = rebuild(flow, settings);
          void result.then(resolve, reject);
          return result;
        });
      });
      liveFlow.set(mocks.flow());
      liveSettings.set(initialFlowSettings);
      fixture.detectChanges();
      await rendered;
    }

    it('should build the box-line', async () => {
      await renderBoxLine();
      const gElements = document.getElementsByTagName('g');
      expect(gElements.length).toEqual(8);
    });

    it('should exit early if result is invalid', async () => {
      spyOn(component['elk'], 'layout').and.returnValue(
        Promise.resolve({ children: [], edges: [], width: 1 }),
      );
      await renderBoxLine();
      const gElements = document.getElementsByTagName('g');
      expect(gElements.length).toEqual(0);
    });

    it('should handle drag and drop', async () => {
      await renderBoxLine();
      assert(component['svg'] != null);
      const movingEl = component['svg'].select('svg');
      const x = movingEl.attr('x');
      const y = movingEl.attr('y');
      dragAndDropSelector(fixture, '#lab-flow-svg svg svg', 100, 200);
      expect(movingEl.attr('x')).not.toEqual(x);
      expect(movingEl.attr('y')).not.toEqual(y);
    });

    it('should handle zoom', async () => {
      await renderBoxLine();
      zoomSelector(fixture, '#lab-flow-svg > svg', 500);
      assert(component['svg'] != null);
      expect(component['svg'].select('svg > g').attr('transform')).toBeTruthy();
    });

    it('should set selectedId when a rect is clicked', async () => {
      await renderBoxLine();
      altClickSelector(fixture, '#lab-flow-svg svg svg');
      expect(component['selectedId']()).toEqual(mocks.flow().nodes[0].stepId);
    });

    it('should not set selectedId when default is prevented', async () => {
      await renderBoxLine();
      spyOn(component['selectedId'], 'set');
      altClickSelector(fixture, '#lab-flow-svg svg svg', 0, true);
      expect(component['selectedId'].set).not.toHaveBeenCalled();
    });
  });
});
