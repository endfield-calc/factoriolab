import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import cytoscape from 'cytoscape';
import { select } from 'd3';

import {
  sankeyCenter,
  sankeyJustify,
  sankeyLeft,
  sankeyRight,
} from '~/d3-sankey/align';
import { spread } from '~/helpers';
import { buildFlowFocusPaths, flowLinkId } from '~/helpers/flow-focus';
import { parseRecipe } from '~/models/data/recipe';
import { FlowDiagram } from '~/models/enum/flow-diagram';
import { SankeyAlign } from '~/models/enum/sankey-align';
import { FlowData } from '~/models/flow';
import { ThemeService } from '~/services/theme.service';
import { SettingsService } from '~/store/settings.service';
import {
  altClickSelector,
  assert,
  dragAndDropSelector,
  ItemId,
  Mocks,
  TestModule,
  zoomSelector,
} from '~/tests';

import { routes } from '../../main.routes';
import { FlowComponent, SVG_ID } from './flow.component';

describe('FlowComponent', () => {
  let component: FlowComponent;
  let fixture: ComponentFixture<FlowComponent>;

  function splitFlow(): FlowData {
    const flow = Mocks.getFlow(true);
    const id = `i|${ItemId.IronPlate}`;
    return {
      ...flow,
      nodes: [
        flow.nodes.find((node) => node.id === 'r|0')!,
        flow.nodes.find((node) => node.id === 'r|2')!,
        flow.nodes.find((node) => node.id === 'o|3')!,
        { ...flow.nodes[0], id, name: 'Iron plate', amount: '10' },
        { ...flow.nodes[0], id: 'i|3', name: 'Output', amount: '10' },
      ],
      links: [
        ['r|0', id],
        [id, 'r|2'],
        ['r|2', 'i|3'],
        ['i|3', 'o|3'],
      ].map(([source, target], index) => ({
        ...flow.links[0],
        id: `edge-${String(index)}`,
        source,
        target,
        amount: '10',
      })),
    };
  }

  function dragBoxNode(cy: cytoscape.Core, id: string): void {
    const container = cy.container()!;
    const canvas = container.querySelector('canvas')!;
    const bounds = container.getBoundingClientRect();
    const position = cy.$id(id).renderedPosition();
    const clientX = bounds.left + position.x;
    const clientY = bounds.top + position.y;
    for (const [type, target, offset] of [
      ['mousedown', canvas, 0],
      ['mousemove', window, 30],
      ['mouseup', window, 30],
    ] as const) {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: clientX + offset,
        clientY,
        buttons: type === 'mouseup' ? 0 : 1,
      });
      Object.defineProperty(event, 'which', { value: 1 });
      target.dispatchEvent(event);
    }
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, FlowComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FlowComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('public supply display', () => {
    function publicFlow(): FlowData {
      const template = Mocks.flow.nodes[0];
      const pairs: [string, string][] = [
        ['i|water', 'r|0'],
        ['r|0', 'i|a'],
        ['i|a', 'r|1'],
        ['r|1', 'i|b'],
        ['i|b', 'r|2'],
        ['r|2', 'i|c'],
        ['i|c', 'r|3'],
        ['i|water', 'r|3'],
        ['r|3', 'i|d'],
        ['i|a', 'o|a'],
        ['i|d', 'o|d'],
      ];
      return {
        nodes: [...new Set(pairs.flat())].map((id) => ({
          ...template,
          id,
          stepId: id,
          name: id,
          text: '3/m',
          amount: '3',
          recipe: undefined,
        })),
        links: pairs.map(([source, target], index) => ({
          ...Mocks.flow.links[0],
          id: `public-test-${String(index)}`,
          source,
          target,
          amount: source === 'i|water' && target === 'r|3' ? '2' : '1',
        })),
        rateSuffix: '/m',
        extractionItemIds: ['water'],
      };
    }

    for (const diagram of [FlowDiagram.Sankey, FlowDiagram.BoxLine]) {
      for (const preview of [false, true]) {
        it(`uses local entrances in ${String(diagram)} with base preview ${String(preview)} and restores the original when disabled`, () => {
          spyOn(component, 'rebuildSankey');
          spyOn(component, 'rebuildBoxLine');
          fixture.componentRef.setInput('partitionPreview', preview);
          component.settingsSvc.apply({
            flowPartition: {
              bases: [{ id: 'base:d', name: 'D', outputItemIds: ['d'] }],
            },
          });
          const flow = publicFlow();
          const settings = {
            ...Mocks.flowSettings,
            diagram,
            publicSupplyItemIds: ['water'],
          };
          component.rebuildChart(flow, settings);
          if (preview) component.switchSection('base:d');
          const displayed = component.displayedFlow();
          expect(
            displayed.nodes.filter((n) => n.publicSupply).map((n) => n.amount),
          ).toEqual(['1', '2']);
          if (diagram === FlowDiagram.Sankey)
            expect(component.rebuildSankey).toHaveBeenCalledWith(
              displayed,
              settings,
            );
          else expect(component.rebuildBoxLine).toHaveBeenCalledWith(displayed);
          expect(component.flowData()).toBe(flow);
          component.selectNode(
            displayed.nodes.find((n) => n.id === 'public|water|1')!,
          );
          expect(component.publicSupplyVisible).toBeTrue();
          expect(component.publicSupplyNode()!.publicSupply!.amount).toBe('2');
          expect(component.publicSupplyTotal()).toBe('3');
          component.rebuildChart(flow, {
            ...settings,
            localizePublicSupplies: false,
          });
          expect(
            component.displayedFlow().nodes.some((n) => n.publicSupply),
          ).toBeFalse();
          expect(component.publicSupplyVisible).toBeFalse();
        });
      }
    }

    it('dims unrelated entrances, hides them without broken edges, and preserves the original chart on return', () => {
      component.rebuildChart(publicFlow(), {
        ...Mocks.flowSettings,
        publicSupplyItemIds: ['water'],
      });
      const overview = component.svg!.node();
      component.setFocusTarget('o|a');
      expect(
        component
          .svg!.selectAll('rect')
          .filter((n: any) => n.id === 'public|water|1')
          .style('opacity'),
      ).toBe('0.16');
      component.setHideUnfocused(true);
      const hidden = component['hiddenFlow']!;
      expect(hidden.nodes.some((n) => n.id === 'public|water|1')).toBeFalse();
      expect(
        hidden.nodes.find((n) => n.id === 'i|water')!.publicSupply!.amount,
      ).toBe('1');
      const ids = new Set(hidden.nodes.map((n) => n.id));
      expect(
        hidden.links.every((l) => ids.has(l.source) && ids.has(l.target)),
      ).toBeTrue();
      component.setHideUnfocused(false);
      expect(component.svg!.node()).toBe(overview);
    });

    it('traces all entrances as one material and restores its real supplier when hiding unrelated consumers', () => {
      const raw = publicFlow();
      const material = raw.nodes.find((node) => node.id === 'i|water')!;
      const pump = {
        ...material,
        id: 'r|pump',
        stepId: 'pump',
        text: '2 Pumps',
        recipe: parseRecipe({
          id: 'pump',
          name: 'Pump',
          category: 'mining',
          row: 0,
          time: 1,
          producers: ['pump'],
          in: {},
          out: { water: 1 },
          flags: ['mining'],
        }),
      };
      raw.nodes.push(pump);
      const supplyLink = {
        ...raw.links[0],
        id: 'extracted-water',
        source: pump.id,
        target: material.id,
        amount: '3',
      };
      raw.links.push(supplyLink);
      const flow: FlowData = {
        ...raw,
        nodes: raw.nodes.filter((node) => node.id !== material.id),
        links: raw.links
          .filter((link) => link.id !== supplyLink.id)
          .map((link) => ({
            ...link,
            source: link.source === material.id ? pump.id : link.source,
          })),
        focusGraph: {
          nodes: raw.nodes,
          links: raw.links,
          paths: buildFlowFocusPaths(raw),
          nodeAliases: { [material.id]: pump.id },
        },
        focusTargets: [
          {
            ...material,
            nodeId: pump.id,
            link: supplyLink,
            outgoingLinkIds: raw.links
              .filter((link) => link.source === material.id)
              .map(flowLinkId),
          },
        ],
      };
      component.rebuildChart(flow, {
        ...Mocks.flowSettings,
        publicSupplyItemIds: ['water'],
      });
      component.selectNode(
        component
          .displayedFlow()
          .nodes.find((node) => node.id === 'public|water|1')!,
      );
      expect(component.focusTargetId()).toBe('i|water');
      expect(component.svg!.selectAll('rect.flow-focused-target').size()).toBe(
        2,
      );
      component.setHideUnfocused(true);
      const hidden = component['hiddenFlow']!;
      expect(hidden.nodes.map((node) => node.id)).toEqual([
        'r|pump',
        'i|water',
      ]);
      expect(hidden.links.map((link) => [link.source, link.target])).toEqual([
        ['r|pump', 'i|water'],
      ]);
      expect(hidden.nodes.some((node) => node.publicSupply)).toBeFalse();
      component.setHideUnfocused(false);
      expect(component.svg!.selectAll('rect.flow-focused-target').size()).toBe(
        2,
      );
    });
  });

  describe('onResize', () => {
    it('should resize the cytoscape diagram', fakeAsync(() => {
      const fakeCy = { fit: (): void => {}, destroy: (): void => {} };
      spyOn(fakeCy, 'fit');
      component.cy = fakeCy as any;
      component.onResize();
      tick(200);
      expect(fakeCy.fit).toHaveBeenCalled();
    }));
  });

  describe('ngAfterViewInit', () => {
    it('should rebuild the chart', fakeAsync(() => {
      spyOn(component, 'rebuildChart');
      TestBed.inject(ThemeService).themeValues$.next(Mocks.themeValues);
      tick(100);
      expect(component.rebuildChart).toHaveBeenCalled();
    }));
  });

  describe('rebuildChart', () => {
    it('keeps the regular flow complete even when saved settings enable splitting', () => {
      spyOn(component, 'rebuildSankey');
      component.settingsSvc.apply({
        flowPartition: {
          bases: [
            {
              id: 'base:supply',
              name: 'Supply',
              outputItemIds: [ItemId.IronPlate],
            },
          ],
        },
      });
      component.rebuildChart(splitFlow(), Mocks.flowSettings);
      component.switchSection(component.sections()[0].id);
      expect(component.activeSectionId()).toBeNull();
      expect(component.displayedFlow()).toBe(component.flowData());
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('.flow-section-tabs')).toBeNull();
      expect(element.querySelector('button .fa-plus')).toBeNull();
    });

    it('restores bases, stages edits until saving and returns production to main on deletion', () => {
      fixture.componentRef.setInput('partitionPreview', true);
      spyOn(component, 'rebuildSankey');
      component.settingsSvc.apply({
        flowPartition: {
          bases: [
            {
              id: 'base:supply',
              name: 'Supply',
              outputItemIds: [ItemId.IronPlate],
            },
          ],
        },
      });
      component.rebuildChart(splitFlow(), Mocks.flowSettings, [
        'From warehouse',
        'To warehouse',
      ]);
      expect(component.activeSection()).toBeDefined();
      expect(
        component.displayedFlow().nodes.some((node) => node.warehouse),
      ).toBeTrue();
      const port = component
        .displayedFlow()
        .nodes.find((node) => node.warehouse)!;
      component.selectNode(port);
      expect(component.warehouseVisible).toBeTrue();
      expect(component.warehouseSections().length).toBeGreaterThan(0);
      component.openBaseEditor('base:supply');
      component.baseNameDraft = 'My production line';
      expect(component.partitionSettings().bases[0].name).toBe('Supply');
      component.saveBase();
      expect(component.partitionSettings().bases[0].name).toBe(
        'My production line',
      );
      component.deletingBaseId = 'base:supply';
      component.removeBase();
      component.rebuildChart(splitFlow(), Mocks.flowSettings);
      expect(component.splitView()).toBeFalse();
      expect(component.activeSectionId()).toBeNull();
      expect(component.displayedFlow()).toBe(component.flowData());
    });

    it('creates bases only on save, validates outputs and preserves charts on rename', () => {
      fixture.componentRef.setInput('partitionPreview', true);
      spyOn(component, 'rebuildSankey');
      const flow = splitFlow();
      component.rebuildChart(flow, Mocks.flowSettings);
      component.openBaseEditor();
      component.saveBase();
      expect(component.partitionSettings().bases.length).toBe(0);
      expect(component.baseError).toBeTruthy();
      component.baseOutputsDraft = [ItemId.IronPlate];
      component.baseNameDraft = 'Supply';
      component.saveBase();
      expect(component.partitionSettings().bases.length).toBe(1);
      const id = component.partitionSettings().bases[0].id;
      expect(component.activeSectionId()).toBe(id);
      component.rebuildChart(flow, Mocks.flowSettings);
      const rebuilds = (component.rebuildSankey as jasmine.Spy).calls.count();
      component.openBaseEditor(id);
      component.baseNameDraft = 'Renamed';
      component.saveBase();
      component.rebuildChart(flow, Mocks.flowSettings);
      expect((component.rebuildSankey as jasmine.Spy).calls.count()).toBe(
        rebuilds,
      );
      expect(component.activeSection()?.name).toBe('Renamed');
      component.openBaseEditor();
      component.baseOutputsDraft = [ItemId.IronPlate];
      component.saveBase();
      expect(component.baseError).toBeTruthy();
      expect(component.partitionSettings().bases.length).toBe(1);
    });
    it('should call to rebuild the sankey', () => {
      spyOn(component, 'rebuildSankey');
      component.rebuildChart(Mocks.flow, Mocks.flowSettings);
      expect(component.rebuildSankey).toHaveBeenCalledWith(
        Mocks.flow,
        Mocks.flowSettings,
      );
    });

    it('should call to rebuild the box-line', () => {
      spyOn(component, 'rebuildBoxLine');
      component.rebuildChart(
        Mocks.flow,
        spread(Mocks.flowSettings, { diagram: FlowDiagram.BoxLine }),
      );
      expect(component.rebuildBoxLine).toHaveBeenCalledWith(Mocks.flow);
    });
  });

  describe('rebuildSankey', () => {
    beforeEach(() => {
      select(`#${SVG_ID} > *`).remove();
    });

    it('should build the sankey', () => {
      component.rebuildSankey(Mocks.flow, Mocks.flowSettings);
      const gElements = document.getElementsByTagName('g');
      expect(gElements.length).toEqual(14);
    });

    it('should handle drag and drop', () => {
      component.rebuildSankey(Mocks.flow, Mocks.flowSettings);
      dragAndDropSelector(fixture, 'rect', 100, 200);
      assert(component.svg != null);
      expect(component.svg.select('rect').attr('transform')).toBeTruthy();
      expect(
        component.svg.select('#image-r\\|0').attr('transform'),
      ).toBeTruthy();
    });

    it('should handle zoom', () => {
      component.rebuildSankey(Mocks.flow, Mocks.flowSettings);
      zoomSelector(fixture, '#lab-flow-svg > svg', 500);
      assert(component.svg != null);
      expect(component.svg.select('g').attr('transform')).toBeTruthy();
    });

    it('should set selectedId when a rect is clicked', () => {
      component.rebuildSankey(Mocks.flow, Mocks.flowSettings);
      altClickSelector(fixture, 'rect');
      expect(component.selectedId()).toEqual(Mocks.flow.nodes[0].stepId);
    });

    it('should set selectedId emit when default is prevented', () => {
      component.rebuildSankey(Mocks.flow, Mocks.flowSettings);
      spyOn(component.selectedId, 'set');
      altClickSelector(fixture, 'rect', 0, true);
      expect(component.selectedId.set).not.toHaveBeenCalled();
    });
  });

  describe('rebuildBoxLine', () => {
    it('keeps real pointer dragging active after revisiting a cached base and leaving focused view', async () => {
      fixture.componentRef.setInput('partitionPreview', true);
      component.settingsSvc.apply({
        flowPartition: {
          bases: [
            {
              id: 'base:supply',
              name: 'Supply',
              outputItemIds: [ItemId.IronPlate],
            },
          ],
        },
      });
      component.rebuildChart(splitFlow(), {
        ...Mocks.flowSettings,
        diagram: FlowDiagram.BoxLine,
      });
      const main = component.cy!;
      const mainDone = main.promiseOn('layoutstop');
      component.switchSection('base:supply');
      const supply = component.cy!;
      const supplyDone = supply.promiseOn('layoutstop');
      await Promise.all([mainDone, supplyDone]);
      const start = { ...supply.$id('r|0').position() };
      dragBoxNode(supply, 'r|0');
      expect(supply.$id('r|0').position().x).toBeGreaterThan(start.x);

      for (let i = 0; i < 2; i++) {
        component.switchSection(null);
        await Promise.resolve(); // Let DOM-removal observers run, as between real clicks.
        component.switchSection('base:supply');
        await Promise.resolve();
        expect(component.cy).toBe(supply);
        const before = { ...supply.$id('r|0').position() };
        dragBoxNode(supply, 'r|0');
        expect(supply.$id('r|0').position().x).toBeGreaterThan(before.x);
      }
      component.setFocusTarget('o|3');
      component.setHideUnfocused(true);
      const focused = component.cy!;
      const focusedDone = focused.promiseOn('layoutstop');
      await focusedDone;
      component.setHideUnfocused(false);
      await Promise.resolve();
      expect(component.cy).toBe(supply);
      const before = { ...supply.$id('r|0').position() };
      dragBoxNode(supply, 'r|0');
      expect(supply.$id('r|0').position().x).toBeGreaterThan(before.x);
    });

    it('preserves each split chart and its positions through pending layouts and tab switches', async () => {
      fixture.componentRef.setInput('partitionPreview', true);
      component.settingsSvc.apply({
        flowPartition: {
          bases: [
            {
              id: 'base:supply',
              name: 'Supply',
              outputItemIds: [ItemId.IronPlate],
            },
          ],
        },
      });
      component.rebuildChart(
        splitFlow(),
        { ...Mocks.flowSettings, diagram: FlowDiagram.BoxLine },
        ['From warehouse', 'To warehouse'],
      );
      component.switchSection('base:supply');
      const firstSection = component.activeSectionId()!;
      const first = component.cy!;
      const firstDone = first.promiseOn('layoutstop');
      component.switchSection(null);
      const overview = component.cy!;
      const overviewDone = overview.promiseOn('layoutstop');
      component.switchSection(firstSection);
      expect(component.cy).toBe(first);
      expect(first.container()!.isConnected).toBeTrue();
      await Promise.all([firstDone, overviewDone]);
      first
        .$id(component.activeSection()!.recipeNodeIds[0])
        .position({ x: 123, y: 456 });
      first.zoom(1.5);
      first.pan({ x: 10, y: 20 });
      component.switchSection(null);
      component.switchSection(firstSection);
      expect(component.cy).toBe(first);
      expect(first.zoom()).toBe(1.5);
      expect(first.pan()).toEqual({ x: 10, y: 20 });
      expect(
        first.$id(component.activeSection()!.recipeNodeIds[0]).position(),
      ).toEqual({ x: 123, y: 456 });
      component.setFocusTarget('o|3');
      component.setHideUnfocused(true);
      const focused = component.cy!;
      const focusedDone = focused.promiseOn('layoutstop');
      component.switchSection(null);
      component.setHideUnfocused(false);
      component.switchSection(firstSection);
      expect(component.cy).toBe(first);
      await focusedDone;
      expect(focused.destroyed()).toBeTrue();
    });
    it('safely changes hidden ranges and restores the overview during pending ELK layouts', async () => {
      component.rebuildChart(Mocks.getFlow(true), {
        ...Mocks.flowSettings,
        diagram: FlowDiagram.BoxLine,
      });
      const overview = component.cy!;
      const overviewDone = overview.promiseOn('layoutstop');
      component.setFocusTarget('o|3');
      component.setHideUnfocused(true);
      const focused = component.cy!;
      const focusedDone = focused.promiseOn('layoutstop');
      component.setFocusDepth(2);
      component.setTraceOtherInputs(true);
      expect(component.cy).toBe(focused);
      component.setFocusTarget(null);
      expect(component.cy).toBe(overview);
      expect(overview.container()!.isConnected).toBeTrue();
      await Promise.all([overviewDone, focusedDone]);
      expect(overview.destroyed()).toBeFalse();
      expect(focused.destroyed()).toBeTrue();
      overview.$id('r|0').position({ x: 123, y: 456 });
      overview.zoom(1.5);
      overview.pan({ x: 10, y: 20 });
      component.setFocusTarget('o|3');
      const hidden = component.cy!;
      const hiddenDone = hidden.promiseOn('layoutstop');
      component.rebuildChart(
        {
          ...component.flowData(),
          links: component.flowData().links.slice(0, 4),
        },
        { ...Mocks.flowSettings, diagram: FlowDiagram.BoxLine },
      );
      const rebuiltOverview = component.cy!;
      const rebuiltDone = rebuiltOverview.promiseOn('layoutstop');
      component.setHideUnfocused(false);
      const restoredOverview = component.cy!;
      const restoredDone = restoredOverview.promiseOn('layoutstop');
      await Promise.all([hiddenDone, rebuiltDone, restoredDone]);
      expect(overview.destroyed()).toBeTrue();
      expect(hidden.destroyed()).toBeTrue();
      expect(rebuiltOverview.destroyed()).toBeTrue();
      expect(restoredOverview.destroyed()).toBeFalse();
      expect(restoredOverview.container()!.isConnected).toBeTrue();
    });

    it('changes focus depth without replacing a chart while its ELK layout is pending', async () => {
      component.rebuildChart(Mocks.getFlow(true), {
        ...Mocks.flowSettings,
        diagram: FlowDiagram.BoxLine,
      });
      const overview = component.cy!;
      const overviewDone = overview.promiseOn('layoutstop');
      component.setFocusTarget('o|3');
      component.setFocusDepth(2);
      component.setTraceOtherInputs(true);
      component.setFocusTarget(null);
      expect(component.cy).toBe(overview);
      expect(overview.container()!.isConnected).toBeTrue();
      await overviewDone;
      expect(overview.destroyed()).toBeFalse();
      expect(overview.container()!.childNodes.length).toBeGreaterThan(0);
      overview.$id('r|0').position({ x: 123, y: 456 });
      overview.zoom(1.5);
      overview.pan({ x: 10, y: 20 });
      component.setFocusTarget('o|3');
      component.setFocusDepth(0);
      component.setFocusTarget(null);
      expect(overview.$id('r|0').position()).toEqual({ x: 123, y: 456 });
      expect(overview.zoom()).toEqual(1.5);
      expect(overview.pan()).toEqual({ x: 10, y: 20 });
    });

    it('should build the chart from flow data', () => {
      component.rebuildBoxLine(Mocks.getFlow(true));
      expect(component.cy).toBeTruthy();
    });

    it('should set selectedId when a node is clicked', () => {
      component.rebuildBoxLine(Mocks.getFlow(true));
      spyOn(component.selectedId, 'set');
      component.cy?.nodes().emit('click');
      expect(component.selectedId.set).toHaveBeenCalled();
    });
  });

  for (const diagram of [FlowDiagram.Sankey, FlowDiagram.BoxLine]) {
    describe(`product focus in diagram ${String(diagram)}`, () => {
      beforeEach(() => {
        if (diagram === FlowDiagram.BoxLine) {
          spyOn(component, 'rebuildBoxLine').and.callFake((flow) => {
            component.cy = cytoscape({
              headless: true,
              elements: {
                nodes: flow.nodes.map((node) => ({ data: node })),
                edges: flow.links.map((link, index) => ({
                  data: {
                    ...link,
                    id: flowLinkId(link, index),
                    focusId: flowLinkId(link, index),
                  },
                })),
              },
            });
            spyOn(component.cy, 'mount').and.stub();
            spyOn(component.cy, 'unmount').and.stub();
          });
        }
        component.rebuildChart(
          { ...Mocks.getFlow(), modId: '1.1' },
          { ...Mocks.flowSettings, diagram },
        );
      });

      it('uses selection alone to focus and keeps both options enabled without a target', () => {
        fixture.detectChanges();
        expect(component.focusTargets().map((node) => node.id)).toEqual([
          'o|3',
        ]);
        expect(component.focusTargetId()).toBeNull();
        const element = fixture.nativeElement as HTMLElement;
        expect(element.querySelector('#flow-focus-mode')).toBeNull();
        const trace =
          element.querySelector<HTMLInputElement>('#flow-trace-inputs')!;
        const hide = element.querySelector<HTMLInputElement>(
          '#flow-hide-unfocused',
        )!;
        expect(trace.disabled).toBeFalse();
        expect(hide.disabled).toBeFalse();
        const cy = component.cy;
        const svg = component.svg;
        trace.click();
        hide.click();
        fixture.detectChanges();
        expect(component.traceOtherInputs()).toBeTrue();
        expect(component.hideUnfocused()).toBeTrue();
        expect(component.focusTargetId()).toBeNull();
        expect(component.cy).toBe(cy);
        expect(component.svg).toBe(svg);
      });

      it('focuses a terminal target while recipe nodes only update the detail selection', () => {
        const flow = component.flowData();
        component.selectNode(flow.nodes[0]);
        expect(component.focusTargetId()).toBeNull();
        expect(component.focusTargetId()).toBeNull();
        component.selectNode(flow.nodes[3]);
        expect(component.focusTargetId()).toEqual('o|3');
        expect(component.focusTargetId()).not.toBeNull();
        component.selectNode(flow.nodes[1]);
        expect(component.selectedId()).toEqual(flow.nodes[1].stepId);
        expect(component.focusTargetId()).toEqual('o|3');
        expect(component.focusTargetId()).not.toBeNull();
      });

      it('offers and focuses a visible intermediate without including its downstream branch', () => {
        const flow = component.flowData();
        const material = { ...flow.nodes[3], id: 'i|middle', stepId: 'middle' };
        component.rebuildChart(
          {
            ...flow,
            nodes: [...flow.nodes, material],
            links: [
              ...flow.links.map((link) =>
                link.source === 'r|0' || link.source === 'r|1'
                  ? { ...link, target: material.id }
                  : link,
              ),
              { ...flow.links[0], source: material.id, target: 'r|2' },
            ],
          },
          { ...Mocks.flowSettings, diagram },
        );
        expect(component.focusTargets().map((node) => node.id)).toEqual([
          'o|3',
          material.id,
        ]);
        const overviewSvg = component.svg;
        const overviewCy = component.cy;
        component.selectNode(material);
        expect(component.focusTargetId()).toEqual(material.id);
        expect(component.selectedId()).toEqual(material.stepId);
        expect(component.focusTargetId()).not.toBeNull();
        expect(component.svg).toBe(overviewSvg);
        expect(component.cy).toBe(overviewCy);
        if (component.cy) {
          expect(component.cy.$id('r|2').hasClass('flow-dimmed')).toBeTrue();
          expect(
            component.cy.$id(material.id).hasClass('flow-focused-target'),
          ).toBeTrue();
        }
        component.setFocusDepth(2);
        if (component.cy) {
          expect(component.cy.$id('r|2').hasClass('flow-dimmed')).toBeTrue();
          expect(component.cy.nodes().length).toEqual(flow.nodes.length + 1);
        } else
          expect(component.svg!.selectAll('rect').size()).toEqual(
            flow.nodes.length + 1,
          );
        component.setFocusTarget(null);
        expect(component.svg).toBe(overviewSvg);
        expect(component.cy).toBe(overviewCy);
      });

      for (const itemId of [ItemId.CrudeOil, ItemId.Water]) {
        it(`selects merged ${itemId} and retains its focus and settings on recalculation`, () => {
          const flow = component.flowSvc.buildGraph(
            Mocks.lightOilSteps,
            '/m',
            Mocks.settingsStateInitial,
            Mocks.preferencesState,
            Mocks.adjustedDataset,
            Mocks.themeValues,
          );
          const target = flow.focusTargets!.find(
            (node) => node.id === `i|${itemId}`,
          )!;
          component.rebuildChart(flow, { ...Mocks.flowSettings, diagram });
          component.setFocusTarget(target.id);
          expect(component.selectedId()).toEqual(target.stepId);
          if (component.cy) {
            expect(
              component.cy.$id(target.nodeId).hasClass('flow-focused-target'),
            ).toBeTrue();
          } else {
            expect(
              component.svg!.selectAll('rect.flow-focused-target').size(),
            ).toEqual(1);
          }
          component.setFocusDepth(2);
          component.setTraceOtherInputs(true);
          component.rebuildChart(flow, { ...Mocks.flowSettings, diagram });
          expect(component.focusTargetId()).toEqual(target.id);
          expect(component.focusTargetId()).not.toBeNull();
          expect(component.focusDepth()).toEqual(2);
          expect(component.traceOtherInputs()).toBeTrue();
          if (component.cy) {
            expect(
              component.cy.$id(target.nodeId).hasClass('flow-focused-target'),
            ).toBeTrue();
          } else {
            expect(
              component.svg!.selectAll('rect.flow-focused-target').size(),
            ).toEqual(1);
            expect(component.svg!.attr('viewBox')).not.toMatch(/NaN|Infinity/);
          }
          const svg = component.svg;
          const cy = component.cy;
          component.selectNode(target);
          expect(component.svg).toBe(svg);
          expect(component.cy).toBe(cy);
          component.setFocusTarget(null);
          expect(component.focusTargetId()).toBeNull();
          component.setFocusTarget(target.id);
          component.rebuildChart(
            {
              ...flow,
              focusTargets: flow.focusTargets!.filter(
                (node) => node.id !== target.id,
              ),
            },
            { ...Mocks.flowSettings, diagram },
          );
          expect(component.focusTargetId()).toBeNull();
          expect(component.focusTargetId()).toBeNull();
        });
      }

      it('switches targets without changing the chart or expansion settings', () => {
        const flow = component.flowData();
        component.rebuildChart(
          {
            ...flow,
            nodes: [
              ...flow.nodes,
              { ...flow.nodes[3], id: 'o|5', stepId: 'o|5' },
            ],
            links: [
              ...flow.links,
              { ...flow.links[0], source: 'r|1', target: 'o|5' },
            ],
          },
          { ...Mocks.flowSettings, diagram },
        );
        const svg = component.svg;
        const cy = component.cy;
        component.setFocusTarget('o|3');
        component.setFocusDepth(2);
        component.setFocusTarget('o|5');
        expect(component.focusTargetId()).not.toBeNull();
        expect(component.focusDepth()).toEqual(2);
        if (component.cy) {
          expect(
            component.cy
              .nodes()
              .filter((node) => !node.hasClass('flow-dimmed'))
              .map((node) => node.id())
              .sort(),
          ).toEqual(['o|5', 'r|1']);
        } else {
          expect(
            component
              .svg!.selectAll<SVGRectElement, unknown>('rect')
              .filter(function () {
                return this.style.opacity === '1';
              })
              .size(),
          ).toEqual(2);
        }
        component.setFocusTarget('o|5');
        expect(component.svg).toBe(svg);
        expect(component.cy).toBe(cy);
        expect(component.focusTargetId()).toEqual('o|5');
      });

      it('dims unrelated nodes and links without replacing the overview or running the solver', () => {
        const svg = component.svg;
        const cy = component.cy;
        const solve = spyOn(
          component.flowSvc.objectivesSvc.simplexSvc,
          'solve',
        );
        component.setFocusTarget('o|3');
        expect(component.svg).toBe(svg);
        expect(component.cy).toBe(cy);
        if (cy) {
          expect(cy.$id('s|4').hasClass('flow-dimmed')).toBeTrue();
          expect(cy.$id('r|0').hasClass('flow-dimmed')).toBeFalse();
          expect(cy.$id('o|3').hasClass('flow-focused-target')).toBeTrue();
          expect(cy.edges().last().hasClass('flow-dimmed')).toBeTrue();
        } else {
          const rects = (
            fixture.nativeElement as HTMLElement
          ).querySelectorAll<SVGRectElement>('rect');
          expect(rects[4].style.opacity).toEqual('0.16');
          expect(rects[0].style.opacity).toEqual('1');
          expect(rects[3].classList.contains('flow-focused-target')).toBeTrue();
          expect(svg!.selectAll('.flow-link').nodes().length).toEqual(5);
          expect(
            (svg!.selectAll('.flow-link').nodes()[4] as HTMLElement).style
              .opacity,
          ).toEqual('0.12');
        }
        component.setFocusTarget(null);
        expect(component.focusTargetId()).toBeNull();
        expect(solve).not.toHaveBeenCalled();
      });

      it('updates the depth and tracing controls without replacing the chart or solving again', () => {
        const flow = component.flowData();
        const pairs: [string, string][] = [
          ['r|0', 'i|product'],
          ['i|product', 'o|product'],
          ['r|0', 'i|waste'],
          ['i|waste', 'r|1'],
          ['r|1', 'i|recovered'],
          ['i|extra', 'r|1'],
          ['r|2', 'i|extra'],
        ];
        component.rebuildChart(
          {
            nodes: [...new Set(pairs.flat())].map((id) => ({
              ...flow.nodes[0],
              id,
              stepId: id,
            })),
            links: pairs.map(([source, target], index) => ({
              ...flow.links[0],
              id: `depth-edge-${String(index)}`,
              source,
              target,
              ...(index === 2 ? { byproduct: true } : {}),
            })),
          },
          { ...Mocks.flowSettings, diagram },
        );
        const cy = component.cy;
        const svg = component.svg;
        const solve = spyOn(
          component.flowSvc.objectivesSvc.simplexSvc,
          'solve',
        );
        const isDimmed = (id: string): boolean =>
          cy
            ? cy.$id(id).hasClass('flow-dimmed')
            : svg!
                .selectAll<SVGRectElement, { id: string }>('rect')
                .filter((node) => node.id === id)
                .style('opacity') === '0.16';
        component.setFocusTarget('o|product');
        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;
        const toggle =
          element.querySelector<HTMLInputElement>('#flow-trace-inputs')!;
        expect(component.focusDepth()).toEqual(1);
        expect(component.traceOtherInputs()).toBeFalse();
        expect(toggle.disabled).toBeFalse();
        expect(isDimmed('i|waste')).toBeFalse();
        expect(isDimmed('r|1')).toBeTrue();
        component.setFocusDepth(2);
        fixture.detectChanges();
        expect(toggle.disabled).toBeFalse();
        expect(isDimmed('r|1')).toBeFalse();
        expect(isDimmed('i|extra')).toBeFalse();
        expect(isDimmed('r|2')).toBeTrue();
        toggle.click();
        fixture.detectChanges();
        expect(component.traceOtherInputs()).toBeTrue();
        expect(isDimmed('r|2')).toBeFalse();
        toggle.click();
        fixture.detectChanges();
        expect(component.traceOtherInputs()).toBeFalse();
        expect(isDimmed('r|2')).toBeTrue();
        component.setFocusDepth(-2);
        expect(component.focusDepth()).toEqual(0);
        expect(isDimmed('i|waste')).toBeTrue();
        component.setFocusDepth(null);
        component.setFocusDepth(Number.NaN);
        expect(component.focusDepth()).toEqual(0);
        component.setFocusDepth(2.9);
        expect(component.focusDepth()).toEqual(2);
        component.setFocusTarget(null);
        fixture.detectChanges();
        expect(toggle.disabled).toBeFalse();
        expect(isDimmed('r|2')).toBeFalse();
        expect(component.cy).toBe(cy);
        expect(component.svg).toBe(svg);
        expect(solve).not.toHaveBeenCalled();
        component.setFocusTarget('o|product');
        component.setHideUnfocused(true);
        const visibleIds = (): string[] =>
          component.cy
            ? component.cy.nodes().map((node) => node.id())
            : component
                .svg!.selectAll<SVGRectElement, { id: string }>('rect')
                .data()
                .map((node) => node.id);
        expect(visibleIds()).toContain('r|1');
        expect(visibleIds()).toContain('i|extra');
        expect(visibleIds()).not.toContain('r|2');
        component.setTraceOtherInputs(true);
        expect(visibleIds()).toContain('r|2');
        component.setFocusDepth(0);
        expect(visibleIds().sort()).toEqual(['i|product', 'o|product', 'r|0']);
        component.setFocusDepth(1);
        expect(visibleIds()).toContain('i|waste');
        expect(visibleIds()).not.toContain('r|1');
        component.setFocusDepth(2);
        expect(visibleIds()).toContain('r|2');
        expect(solve).not.toHaveBeenCalled();
      });

      it('dims recovery-only dependencies without removing them at level 0', () => {
        const flow = component.flowData();
        component.rebuildChart(
          {
            ...flow,
            focusPaths: {
              'o|3': {
                nodeIds: ['r|0', 'r|1', 'r|2', 'o|3'],
                linkIds: flow.links.slice(0, 4).map(flowLinkId),
                mainNodeIds: ['r|0', 'r|2', 'o|3'],
                mainLinkIds: [
                  flowLinkId(flow.links[0], 0),
                  flowLinkId(flow.links[3], 3),
                ],
              },
            },
          },
          { ...Mocks.flowSettings, diagram },
        );
        component.setFocusDepth(0);
        component.setFocusTarget('o|3');
        const assertDimmed = (): void => {
          if (component.cy) {
            expect(component.cy.$id('r|1').hasClass('flow-dimmed')).toBeTrue();
            expect(component.cy.$id('r|0').hasClass('flow-dimmed')).toBeFalse();
            expect(
              component.cy
                .$id(flowLinkId(flow.links[1], 1))
                .hasClass('flow-dimmed'),
            ).toBeTrue();
          } else {
            expect(
              component
                .svg!.selectAll<SVGRectElement, { id: string }>('rect')
                .filter((node) => node.id === 'r|1')
                .style('opacity'),
            ).toEqual('0.16');
            expect(
              component
                .svg!.selectAll<SVGRectElement, { id: string }>('rect')
                .filter((node) => node.id === 'r|0')
                .style('opacity'),
            ).toEqual('1');
          }
        };
        assertDimmed();
        if (component.cy) {
          expect(component.cy.nodes().length).toEqual(5);
        } else expect(component.svg!.selectAll('rect').size()).toEqual(5);
        component.setFocusTarget(null);
        if (component.cy) {
          expect(component.cy.elements('.flow-dimmed').length).toEqual(0);
        } else {
          expect(
            component
              .svg!.selectAll('rect')
              .nodes()
              .every((node) => (node as SVGRectElement).style.opacity === '1'),
          ).toBeTrue();
        }
      });

      it('hides unrelated content and restores the overview placement without solving again', fakeAsync(() => {
        const flow = component.flowData();
        const cy = component.cy;
        const svg = component.svg;
        const before = JSON.stringify(flow);
        const solve = spyOn(
          component.flowSvc.objectivesSvc.simplexSvc,
          'solve',
        );
        if (cy) {
          cy.$id('r|0').position({ x: 123, y: 456 });
          cy.zoom(1.5);
          cy.pan({ x: 10, y: 20 });
        } else {
          dragAndDropSelector(fixture, 'rect', 100, 200);
          // D3 suppresses the click immediately following a completed drag.
          tick(0);
        }
        const transform = svg?.select('rect').attr('transform') ?? '';
        component.setFocusTarget('o|3');
        fixture.detectChanges();
        (fixture.nativeElement as HTMLElement)
          .querySelector<HTMLInputElement>('#flow-hide-unfocused')!
          .click();
        fixture.detectChanges();
        expect(component.hideUnfocused()).toBeTrue();
        if (component.cy) {
          expect(
            component.cy
              .nodes()
              .map((node) => node.id())
              .sort(),
          ).toEqual(['o|3', 'r|0', 'r|1', 'r|2']);
          expect(component.cy.edges().length).toEqual(4);
        } else {
          expect(component.svg!.selectAll('rect').size()).toEqual(4);
          expect(component.svg!.selectAll('.flow-link-label').size()).toEqual(
            4,
          );
        }
        const hiddenCy = component.cy;
        const hiddenSvg = component.svg;
        component.setFocusDepth(2);
        component.setTraceOtherInputs(true);
        expect(component.cy).toBe(hiddenCy);
        expect(component.svg).toBe(hiddenSvg);
        component.setHideUnfocused(false);
        expect(component.cy).toBe(cy);
        expect(component.svg).toBe(svg);
        if (cy) {
          expect(cy.$id('s|4').hasClass('flow-dimmed')).toBeTrue();
          expect(cy.$id('r|0').position()).toEqual({ x: 123, y: 456 });
          expect(cy.zoom()).toEqual(1.5);
          expect(cy.pan()).toEqual({ x: 10, y: 20 });
        } else expect(svg!.select('rect').attr('transform')).toEqual(transform);
        component.setHideUnfocused(true);
        component.setFocusTarget(null);
        expect(component.cy).toBe(cy);
        expect(component.svg).toBe(svg);
        expect(component.hideUnfocused()).toBeTrue();
        expect(JSON.stringify(component.flowData())).toEqual(before);
        expect(solve).not.toHaveBeenCalled();
      }));

      it('shows a selected merged material as an endpoint when hiding', () => {
        const flow = component.flowSvc.buildGraph(
          Mocks.lightOilSteps,
          '/m',
          Mocks.settingsStateInitial,
          Mocks.preferencesState,
          Mocks.adjustedDataset,
          Mocks.themeValues,
        );
        component.rebuildChart(flow, { ...Mocks.flowSettings, diagram });
        component.setFocusDepth(0);
        component.setFocusTarget(`i|${ItemId.CrudeOil}`);
        component.setHideUnfocused(true);
        if (component.cy) {
          expect(component.cy.nodes().length).toEqual(2);
          expect(component.cy.edges().length).toEqual(1);
          expect(
            component.cy
              .$id(`i|${ItemId.CrudeOil}`)
              .hasClass('flow-focused-target'),
          ).toBeTrue();
        } else {
          expect(component.svg!.selectAll('rect').size()).toEqual(2);
          expect(component.svg!.selectAll('.flow-link').size()).toEqual(1);
          expect(
            component.svg!.selectAll('rect.flow-focused-target').size(),
          ).toEqual(1);
          expect(component.svg!.attr('viewBox')).not.toMatch(/NaN|Infinity/);
        }
        component.setHideUnfocused(false);
        expect(component.focusTargetId()).toEqual(`i|${ItemId.CrudeOil}`);
      });

      it('keeps node positions and viewport while changing depth and tracing', () => {
        const svg = component.svg;
        const cy = component.cy;
        let transform = '';
        let zoomTransform = '';
        if (cy) {
          cy.$id('r|0').position({ x: 123, y: 456 });
          cy.zoom(1.5);
          cy.pan({ x: 10, y: 20 });
        } else {
          dragAndDropSelector(fixture, 'rect', 100, 200);
          zoomSelector(fixture, '#lab-flow-svg > svg', 500);
          transform = svg!.select('rect').attr('transform');
          zoomTransform = svg!.select('g').attr('transform');
        }
        component.setFocusTarget('o|3');
        const detailId = component.selectedId();
        component.setFocusDepth(2);
        component.setTraceOtherInputs(true);
        expect(component.selectedId()).toEqual(detailId);
        const focusSvg = component.svg;
        const focusCy = component.cy;
        component.selectNode(component.flowData().nodes[3]);
        expect(component.svg).toBe(focusSvg);
        expect(component.cy).toBe(focusCy);
        if (cy) {
          expect(component.cy).toBe(cy);
          expect(component.cy!.nodes().length).toEqual(5);
          expect(component.cy!.$id('s|4').length).toEqual(1);
          expect(cy.destroyed()).toBeFalse();
        } else {
          expect(component.svg).toBe(svg);
          expect(
            (fixture.nativeElement as HTMLElement).querySelectorAll('rect')
              .length,
          ).toEqual(5);
        }
        component.setFocusTarget(null);
        expect(component.svg).toBe(svg);
        expect(component.cy).toBe(cy);
        if (cy) {
          expect(cy.$id('r|0').position()).toEqual({ x: 123, y: 456 });
          expect(cy.zoom()).toEqual(1.5);
          expect(cy.pan()).toEqual({ x: 10, y: 20 });
        } else {
          expect(svg!.select('rect').attr('transform')).toEqual(transform);
          expect(svg!.select('g').attr('transform')).toEqual(zoomTransform);
        }
      });

      it('clears focus when the target disappears or the mod changes', () => {
        component.setFocusTarget('o|3');
        const flow = component.flowData();
        component.rebuildChart(
          {
            ...flow,
            nodes: flow.nodes.filter((node) => node.id !== 'o|3'),
            links: flow.links.filter((link) => link.target !== 'o|3'),
          },
          { ...Mocks.flowSettings, diagram },
        );
        expect(component.focusTargetId()).toBeNull();
        expect(component.focusTargetId()).toBeNull();
        component.rebuildChart(flow, { ...Mocks.flowSettings, diagram });
        component.setFocusTarget('o|3');
        component.rebuildChart(
          { ...flow, modId: 'aef' },
          { ...Mocks.flowSettings, diagram },
        );
        expect(component.focusTargetId()).toBeNull();
        expect(component.focusTargetId()).toBeNull();
      });

      it('keeps the target after rate changes and exports the full graph while focused', () => {
        component.setFocusTarget('o|3');
        component.setHideUnfocused(true);
        const flow = component.flowData();
        const updated = {
          ...flow,
          nodes: flow.nodes.map((node) => ({ ...node, text: '20/m' })),
          links: flow.links.map((link) => ({
            ...link,
            value: 20,
            text: '20/m',
          })),
        };
        component.rebuildChart(updated, { ...Mocks.flowSettings, diagram });
        expect(component.focusTargetId()).toEqual('o|3');
        component.setFocusDepth(0);
        fixture.detectChanges();
        const exportGraph = spyOn(component.exportSvc, 'flowToJson');
        const buttons = (
          fixture.nativeElement as HTMLElement
        ).querySelectorAll<HTMLButtonElement>('.flow-actions button');
        buttons[buttons.length - 1].click();
        expect(exportGraph).toHaveBeenCalledWith(updated);
        expect(component.flowData().nodes.length).toEqual(5);
        component.setFocusTarget(null);
        expect(component.focusTargetId()).toBeNull();
        expect(component.focusTargetId()).toBeNull();
      });
    });
  }

  describe('getAlign', () => {
    it('should return the proper sankey alignment function', () => {
      expect(component.getAlign(SankeyAlign.Justify)).toEqual(sankeyJustify);
      expect(component.getAlign(SankeyAlign.Left)).toEqual(sankeyLeft);
      expect(component.getAlign(SankeyAlign.Right)).toEqual(sankeyRight);
      expect(component.getAlign(SankeyAlign.Center)).toEqual(sankeyCenter);
    });
  });

  describe('nodeHeight', () => {
    it('should handle valid or nullish values', () => {
      const valid: any = { y1: 5, y0: 0 };
      const invalid: any = {};
      expect(component.nodeHeight(valid)).toEqual(5);
      expect(component.nodeHeight(invalid)).toEqual(0);
    });
  });
});

describe('Flow tab navigation', () => {
  it('uses the route to select the preview and keeps core materials on returning to full flow', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, FlowComponent],
      providers: [
        provideRouter(
          routes[0].children!.filter((route) =>
            ['flow', 'flow-preview'].includes(route.path ?? ''),
          ),
          withComponentInputBinding(),
        ),
      ],
    }).compileComponents();
    const settings = TestBed.inject(SettingsService);
    const partition = {
      bases: [
        {
          id: 'base:supply',
          name: 'Supply',
          outputItemIds: [ItemId.IronPlate],
        },
      ],
    };
    settings.apply({ flowPartition: partition });
    const harness = await RouterTestingHarness.create();
    const preview = await harness.navigateByUrl('/flow-preview', FlowComponent);
    expect(preview.partitionPreview()).toBeTrue();
    expect(preview.splitView()).toBeTrue();
    const full = await harness.navigateByUrl('/flow', FlowComponent);
    expect(full.partitionPreview()).toBeFalse();
    expect(full.splitView()).toBeFalse();
    expect(settings.state().flowPartition).toEqual(partition);
  });
});
