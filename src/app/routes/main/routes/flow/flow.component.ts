import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import cytoscape from 'cytoscape';
import elk from 'cytoscape-elk';
import { drag, select, Selection, zoom } from 'd3';
import { saveAs } from 'file-saver';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { combineLatest, debounceTime, delay, Subject } from 'rxjs';
import { environment } from 'src/environments';

import { FlowSettingsComponent } from '~/components/flow-settings/flow-settings.component';
import { StepsComponent } from '~/components/steps/steps.component';
import {
  sankeyCenter,
  sankeyJustify,
  sankeyLeft,
  sankeyRight,
} from '~/d3-sankey/align';
import {
  SankeyGraph,
  SankeyGraphMinimal,
  SankeyLayout,
  SankeyLinkExtraProperties,
  SankeyNode,
} from '~/d3-sankey/models';
import { sankey } from '~/d3-sankey/sankey';
import {
  sankeyLinkHorizontal,
  sankeyLinkLoop,
} from '~/d3-sankey/sankey-link-horizontal';
import { coalesce, spread } from '~/helpers';
import {
  expandFlowFocus,
  flowFocusTargets,
  flowLinkId,
  focusedFlow,
} from '~/helpers/flow-focus';
import {
  MAIN_BASE_ID,
  partitionFlow,
  rawFlow,
  sectionFocus,
  warehouseTotals,
} from '~/helpers/flow-partition';
import {
  localizePublicSupplies,
  publicSupplyFocus,
} from '~/helpers/flow-public-supplies';
import { FlowDiagram } from '~/models/enum/flow-diagram';
import { SankeyAlign } from '~/models/enum/sankey-align';
import { FlowData, Link, Node } from '~/models/flow';
import { rational } from '~/models/rational';
import {
  FlowBaseSettings,
  initialFlowPartitionSettings,
} from '~/models/settings/flow-partition-settings';
import { FlowSettings } from '~/models/settings/flow-settings';
import { IconSmClassPipe } from '~/pipes/icon-class.pipe';
import { TranslatePipe } from '~/pipes/translate.pipe';
import { DisplayService } from '~/services/display.service';
import { ExportService } from '~/services/export.service';
import { FlowService } from '~/services/flow.service';
import { TranslateService } from '~/services/translate.service';
import { PreferencesService } from '~/store/preferences.service';
import { SettingsService } from '~/store/settings.service';

export const SVG_ID = 'lab-flow-svg';
const NODE_WIDTH = 32;
interface ChartView {
  svg: FlowComponent['svg'];
  skLayout: FlowComponent['skLayout'];
  cy?: cytoscape.Core;
  pan?: cytoscape.Position;
  zoom?: number;
}
cytoscape.use(elk as cytoscape.Ext);
cytoscape.warnings(environment.debug);

@Component({
  selector: 'lab-flow',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    DropdownModule,
    InputNumberModule,
    InputTextModule,
    MultiSelectModule,
    ProgressSpinnerModule,
    TooltipModule,
    FlowSettingsComponent,
    StepsComponent,
    TranslatePipe,
    IconSmClassPipe,
  ],
  templateUrl: './flow.component.html',
  styleUrls: ['./flow.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowComponent implements AfterViewInit {
  destroyRef = inject(DestroyRef);
  ref = inject(ChangeDetectorRef);
  displaySvc = inject(DisplayService);
  exportSvc = inject(ExportService);
  flowSvc = inject(FlowService);
  preferencesSvc = inject(PreferencesService);
  settingsSvc = inject(SettingsService);
  translateSvc = inject(TranslateService);

  flowSettings = this.preferencesSvc.flowSettings;
  partitionPreview = input(false);

  svgElement = viewChild.required<ElementRef<HTMLElement>>('svg');
  cy?: cytoscape.Core;

  height = window.innerHeight * 0.75;
  svg: Selection<SVGSVGElement, unknown, null, undefined> | undefined;
  skLayout:
    | SankeyLayout<SankeyGraphMinimal<Node, Link>, Node, Link>
    | undefined;

  loading = signal(true);
  selectedId = signal<string | null>(null);
  flowData = signal<FlowData>({ nodes: [], links: [] });
  focusTargetId = signal<string | null>(null);
  focusDepth = signal(1);
  traceOtherInputs = signal(false);
  hideUnfocused = signal(false);
  focusTargets = computed(() => flowFocusTargets(this.flowData()));
  partitionSettings = computed(
    () =>
      this.settingsSvc.state().flowPartition ?? initialFlowPartitionSettings,
  );
  splitView = computed(
    () => this.partitionPreview() && this.partitionSettings().bases.length > 0,
  );
  warehouseLabels = signal({ input: '', output: '', main: '', base: '' });
  sections = computed(() =>
    partitionFlow(
      this.flowData(),
      this.partitionSettings().bases,
      this.warehouseLabels(),
      this.preferencesSvc.columns().items.precision ?? 2,
    ),
  );
  activeSectionId = signal<string | null>(null);
  activeSection = computed(() =>
    this.splitView()
      ? this.sections().find(
          (section) => section.id === (this.activeSectionId() ?? MAIN_BASE_ID),
        )
      : undefined,
  );
  diagramSettings = signal(this.flowSettings());
  displayedFlow = computed(() => {
    const settings = this.diagramSettings();
    return localizePublicSupplies(
      this.activeSection()?.flow ?? this.flowData(),
      settings.localizePublicSupplies,
      settings.publicSupplyItemIds,
      this.preferencesSvc.columns().items.precision,
    );
  });
  editingBaseId = signal<string | null>(null);
  baseOptions = computed(() => {
    const data = this.settingsSvc.dataset();
    const raw = rawFlow(this.flowData());
    const produced = new Set(
      raw.links
        .filter(
          (link) =>
            link.source.startsWith('r|') || link.source.startsWith('m|'),
        )
        .map((link) => link.target),
    );
    const assigned = new Set(
      this.partitionSettings()
        .bases.filter((base) => base.id !== this.editingBaseId())
        .flatMap((base) => base.outputItemIds),
    );
    const ids = new Set([
      ...raw.nodes
        .filter((node) => node.id.startsWith('i|') && produced.has(node.id))
        .map((node) => node.id.slice(2)),
      ...(this.partitionSettings().bases.find(
        (base) => base.id === this.editingBaseId(),
      )?.outputItemIds ?? []),
    ]);
    return [...ids]
      .map((id) => ({
        id,
        name: data.itemEntities[id]?.name ?? id,
        disabled: assigned.has(id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  baseDialogVisible = false;
  baseNameDraft = '';
  baseOutputsDraft: string[] = [];
  baseError = '';
  deletingBaseId: string | null = null;
  MAIN_BASE_ID = MAIN_BASE_ID;
  warehouseNode = signal<Node | null>(null);
  warehouseVisible = false;
  publicSupplyNode = signal<Node | null>(null);
  publicSupplyVisible = false;
  publicSupplyTotal = computed(() => {
    const itemId = this.publicSupplyNode()?.publicSupply?.itemId;
    return itemId ? warehouseTotals(this.flowData(), itemId).consumption : '0';
  });
  warehouseSummary = computed(() => {
    const itemId = this.warehouseNode()?.warehouse?.itemId;
    return itemId ? warehouseTotals(this.flowData(), itemId) : undefined;
  });
  warehouseSections = computed(() => {
    const itemId = this.warehouseNode()?.warehouse?.itemId;
    return this.sections().flatMap((section) =>
      section.flow.nodes.flatMap((node) =>
        node.warehouse?.itemId === itemId && node.warehouse
          ? [
              {
                sectionId: section.id,
                name: section.name,
                port: node.warehouse,
              },
            ]
          : [],
      ),
    );
  });
  fullFocusPath = computed(() => {
    const id = this.focusTargetId();
    return id
      ? expandFlowFocus(
          rawFlow(this.flowData()),
          id,
          this.focusDepth(),
          this.traceOtherInputs(),
        )
      : undefined;
  });
  private pendingLayouts = new WeakSet<cytoscape.Core>();
  private chartSettings = this.flowSettings();
  private partitionShape = '';
  private hiddenFlow?: FlowData;
  private overviewChart?: ChartView;
  private viewCharts = new Map<string | null, ChartView>();
  resize$ = new Subject<void>();
  data$ = combineLatest([
    this.flowSvc.flowData$,
    toObservable(this.preferencesSvc.flowSettings),
    this.translateSvc.multi([
      'flow.warehouseInput',
      'flow.warehouseOutput',
      'flow.mainBase',
      'flow.subBase',
    ]),
    toObservable(this.partitionSettings),
    toObservable(this.partitionPreview),
  ]);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.disposeCytoscape(this.cy);
      this.disposeCytoscape(this.overviewChart?.cy);
      this.viewCharts.forEach((view) => {
        this.disposeCytoscape(view.cy);
      });
    });
  }

  @HostListener('window:resize') onResize(): void {
    this.resize$.next();
  }

  ngAfterViewInit(): void {
    this.data$
      .pipe(debounceTime(100), takeUntilDestroyed(this.destroyRef))
      .subscribe(([flow, settings, labels]) => {
        this.rebuildChart(flow, settings, labels);
      });

    this.resize$
      .pipe(debounceTime(100), delay(100), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cy?.fit());
  }

  rebuildChart(
    flowData: FlowData,
    flowSettings: FlowSettings,
    labels?: string[],
  ): void {
    const partitionShape = JSON.stringify([
      this.partitionPreview(),
      this.partitionSettings().bases.map((base) => [
        base.id,
        base.outputItemIds,
      ]),
    ]);
    const sameLabels =
      !labels ||
      (labels[0] === this.warehouseLabels().input &&
        labels[1] === this.warehouseLabels().output &&
        (labels[2] ?? '') === this.warehouseLabels().main &&
        (labels[3] ?? '') === this.warehouseLabels().base);
    // Renaming a base changes labels only, retaining every cached diagram.
    if (
      this.flowData() === flowData &&
      this.chartSettings === flowSettings &&
      this.partitionShape === partitionShape &&
      sameLabels
    ) {
      this.ref.markForCheck();
      return;
    }
    this.partitionShape = partitionShape;
    this.loading.set(true);
    const targetId = this.focusTargetId();
    const targets = flowFocusTargets(flowData);
    if (
      (this.flowData().modId != null &&
        this.flowData().modId !== flowData.modId) ||
      !targets.some((node) => node.id === targetId)
    ) {
      this.focusTargetId.set(null);
    }
    if (
      ![...flowData.nodes, ...targets].some(
        (node) => node.stepId === this.selectedId(),
      )
    )
      this.selectedId.set(null);
    this.clearChart();
    this.flowData.set(flowData);
    if (labels)
      this.warehouseLabels.set({
        input: labels[0],
        output: labels[1],
        main: labels[2] ?? '',
        base: labels[3] ?? '',
      });
    this.chartSettings = flowSettings;
    this.diagramSettings.set(flowSettings);
    this.publicSupplyVisible = false;
    if (
      !this.splitView() ||
      !this.sections().some((section) => section.id === this.activeSectionId())
    )
      this.activeSectionId.set(null);
    this.clearSelectionOutsideSection();
    this.drawChart(this.displayedFlow(), flowSettings);
    this.applyFocus();
    this.loading.set(false);
    this.ref.detectChanges();
  }

  private drawChart(flowData: FlowData, flowSettings: FlowSettings): void {
    if (flowData.nodes.length && flowData.links.length) {
      if (flowSettings.diagram === FlowDiagram.Sankey) {
        this.rebuildSankey(flowData, flowSettings);
      } else {
        this.rebuildBoxLine(flowData);
      }
    }
  }

  private clearChart(): void {
    this.viewCharts.forEach((view) => {
      this.disposeCytoscape(view.cy);
    });
    this.viewCharts.clear();
    this.disposeCytoscape(this.overviewChart?.cy);
    delete this.overviewChart;
    delete this.hiddenFlow;
    this.clearActiveChart();
  }

  openBaseEditor(id: string | null = null): void {
    const base = this.partitionSettings().bases.find((base) => base.id === id);
    this.editingBaseId.set(base?.id ?? null);
    this.baseNameDraft = base?.name ?? '';
    this.baseOutputsDraft = [...(base?.outputItemIds ?? [])];
    this.baseError = '';
    this.baseDialogVisible = true;
  }

  saveBase(): void {
    const outputs = [...new Set(this.baseOutputsDraft)];
    const bases = this.partitionSettings().bases;
    if (
      !outputs.length ||
      bases.some(
        (base) =>
          base.id !== this.editingBaseId() &&
          base.outputItemIds.some((id) => outputs.includes(id)),
      )
    ) {
      this.baseError = 'flow.baseOutputsRequired';
      return;
    }
    const base: FlowBaseSettings = {
      id:
        this.editingBaseId() ??
        `base:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: this.baseNameDraft.trim(),
      outputItemIds: outputs,
    };
    this.settingsSvc.apply({
      flowPartition: {
        bases: this.editingBaseId()
          ? bases.map((value) => (value.id === base.id ? base : value))
          : [...bases, base],
      },
    });
    // Updating only a name keeps the current view; new bases open their own diagram.
    if (!this.editingBaseId()) this.activeSectionId.set(base.id);
    this.baseDialogVisible = false;
  }

  removeBase(): void {
    this.settingsSvc.apply({
      flowPartition: {
        bases: this.partitionSettings().bases.filter(
          (base) => base.id !== this.deletingBaseId,
        ),
      },
    });
    this.deletingBaseId = null;
  }

  itemName(id: string): string {
    return this.settingsSvc.dataset().itemEntities[id]?.name ?? id;
  }

  baseName(id: string): string {
    return this.sections().find((section) => section.id === id)?.name ?? id;
  }

  private clearSelectionOutsideSection(): void {
    const section = this.activeSection();
    if (
      section &&
      !section.flow.nodes.some((node) => node.stepId === this.selectedId())
    )
      this.selectedId.set(null);
  }

  switchSection(id: string | null): void {
    if (!this.splitView()) return;
    if (id !== null && !this.sections().some((section) => section.id === id))
      return;
    this.restoreOverviewChart();
    const previous = this.activeSectionId();
    const snapshot: ChartView = {
      svg: this.svg,
      skLayout: this.skLayout,
      cy: this.cy,
      pan: this.cy?.pan(),
      zoom: this.cy?.zoom(),
    };
    if (snapshot.svg || snapshot.cy) {
      this.hideChart(snapshot);
      this.viewCharts.set(previous, snapshot);
    }
    delete this.svg;
    delete this.skLayout;
    delete this.cy;
    this.activeSectionId.set(id);
    this.publicSupplyVisible = false;
    this.clearSelectionOutsideSection();
    const cached = this.viewCharts.get(id);
    if (cached) {
      this.viewCharts.delete(id);
      this.overviewChart = cached;
      this.restoreOverviewChart();
    } else this.drawChart(this.displayedFlow(), this.chartSettings);
    this.applyFocus();
  }

  sectionIsFocused(id: string): boolean {
    const section = this.sections().find((value) => value.id === id);
    const path = this.fullFocusPath();
    return (
      !!section && !!path && sectionFocus(section, path).linkIds.length > 0
    );
  }

  formatAmount(amount: string): string {
    return (
      rational(amount).toString(this.preferencesSvc.columns().items.precision) +
      (this.flowData().rateSuffix ?? '')
    );
  }

  jumpToSection(id: string): void {
    this.warehouseVisible = false;
    this.switchSection(id === MAIN_BASE_ID ? null : id);
  }

  private clearActiveChart(): void {
    this.disposeCytoscape(this.cy);
    this.svg?.node()?.remove();
    delete this.cy;
    delete this.svg;
    delete this.skLayout;
  }

  private hideChart(view: ChartView): void {
    view.svg?.node()?.remove();
    const container = view.cy?.container();
    // Cytoscape destroys its renderer and mouse bindings when its container is
    // removed. Keep cached canvases attached while their base is not visible.
    if (container) container.hidden = true;
  }

  private disposeCytoscape(cy: cytoscape.Core | undefined): void {
    if (!cy) return;
    const container = cy.container?.();
    // ELK cannot cancel pending work; let it finish on its detached container.
    if (this.pendingLayouts.has(cy)) {
      container?.remove();
      cy.one('layoutstop', () => {
        cy.destroy();
      });
    } else {
      cy.destroy();
      container?.remove();
    }
  }

  setFocusTarget(id: string | null): void {
    const previousTarget = this.focusTargetId();
    const target = this.focusTargets().find((node) => node.id === id);
    this.focusTargetId.set(target?.id ?? null);
    if (target) this.selectedId.set(target.stepId);
    if (this.focusTargetId() === previousTarget) return;
    this.applyFocus();
  }

  setFocusDepth(depth: number | null): void {
    if (depth == null || !Number.isFinite(depth)) return;
    const normalized = Math.max(0, Math.floor(depth));
    if (normalized === this.focusDepth()) return;
    this.focusDepth.set(normalized);
    this.applyFocus();
  }

  setTraceOtherInputs(enabled: boolean): void {
    if (enabled === this.traceOtherInputs()) return;
    this.traceOtherInputs.set(enabled);
    this.applyFocus();
  }

  setHideUnfocused(enabled: boolean): void {
    if (enabled === this.hideUnfocused()) return;
    this.hideUnfocused.set(enabled);
    this.applyFocus();
  }

  private showFocusedChart(flow: FlowData): void {
    if (!this.overviewChart) {
      this.overviewChart = {
        svg: this.svg,
        skLayout: this.skLayout,
        cy: this.cy,
        pan: this.cy?.pan(),
        zoom: this.cy?.zoom(),
      };
      // Retain the actual chart and its handlers to preserve manual placement.
      this.hideChart(this.overviewChart);
      delete this.svg;
      delete this.skLayout;
      delete this.cy;
    }
    if (
      this.hiddenFlow &&
      this.hiddenFlow.nodes.length === flow.nodes.length &&
      this.hiddenFlow.links.length === flow.links.length &&
      this.hiddenFlow.nodes.every((node, i) => node.id === flow.nodes[i].id) &&
      this.hiddenFlow.links.every(
        (link, i) =>
          link.id === flow.links[i].id &&
          link.source === flow.links[i].source &&
          link.target === flow.links[i].target,
      )
    )
      return;
    this.clearActiveChart();
    this.hiddenFlow = flow;
    this.drawChart(flow, this.chartSettings);
  }

  private restoreOverviewChart(): void {
    const overview = this.overviewChart;
    if (!overview) return;
    this.clearActiveChart();
    delete this.overviewChart;
    delete this.hiddenFlow;
    this.svg = overview.svg;
    this.skLayout = overview.skLayout;
    this.cy = overview.cy;
    const container = this.svg?.node() ?? this.cy?.container();
    if (container && container.parentNode !== this.svgElement().nativeElement)
      this.svgElement().nativeElement.appendChild(container);
    if (this.cy) {
      const canvasContainer = this.cy.container();
      if (canvasContainer) canvasContainer.hidden = false;
      this.cy.resize();
      if (overview.zoom != null) this.cy.zoom(overview.zoom);
      if (overview.pan) this.cy.pan(overview.pan);
    }
  }

  selectNode(node: Node): void {
    if (node.warehouse) {
      this.warehouseNode.set(node);
      this.warehouseVisible = true;
      this.ref.markForCheck();
      return;
    }
    if (node.publicSupply) {
      this.publicSupplyNode.set(node);
      this.publicSupplyVisible = true;
      this.ref.markForCheck();
    }
    this.selectedId.set(node.stepId);
    const materialId = node.publicSupply
      ? `i|${node.publicSupply.itemId}`
      : node.id;
    if (materialId.startsWith('o|') || materialId.startsWith('i|')) {
      const target = this.focusTargets().find(
        (target) =>
          target.id === materialId || target.id === `o|${materialId.slice(2)}`,
      );
      if (target) this.setFocusTarget(target.id);
    }
  }

  private applyFocus(): void {
    const targetId = this.focusTargetId();
    const target = this.focusTargets().find((node) => node.id === targetId);
    let path = targetId
      ? expandFlowFocus(
          this.flowData(),
          targetId,
          this.focusDepth(),
          this.traceOtherInputs(),
        )
      : undefined;
    const section = this.activeSection();
    const fullPath = this.fullFocusPath();
    if (section) path = fullPath ? sectionFocus(section, fullPath) : undefined;
    const originalPath = path;
    const displayed = this.displayedFlow();
    if (path) path = publicSupplyFocus(displayed, path, targetId ?? undefined);
    let nodeIds = path ? new Set(path.nodeIds) : undefined;
    let linkIds = path ? new Set(path.linkIds) : undefined;
    if (this.hideUnfocused() && path) {
      const supplyTarget = displayed.nodes.some(
        (node) => node.publicSupply?.itemId === targetId?.slice(2),
      );
      // Tracking a supply itself shows its real upstream endpoint. Its local
      // entrances have consumers, which are outside an upstream-only focus.
      const flow = focusedFlow(
        supplyTarget ? (section?.flow ?? this.flowData()) : displayed,
        supplyTarget && originalPath ? originalPath : path,
        section ? undefined : (targetId ?? undefined),
      );
      this.showFocusedChart(flow);
      nodeIds = new Set(flow.nodes.map((node) => node.id));
      linkIds = new Set(flow.links.map(flowLinkId));
    } else this.restoreOverviewChart();
    const renderedTargetId =
      target && this.hiddenFlow?.nodes.some((node) => node.id === target.id)
        ? target.id
        : target?.nodeId;
    const isTarget = (node: Node): boolean =>
      node.publicSupply
        ? targetId === `i|${node.publicSupply.itemId}` ||
          targetId === `o|${node.publicSupply.itemId}`
        : node.id === renderedTargetId;
    this.svg
      ?.selectAll<SVGRectElement, SankeyNode<Node, Link>>('rect')
      .style('opacity', (node) => (nodeIds && !nodeIds.has(node.id) ? 0.16 : 1))
      .classed('flow-focused-target', isTarget);
    this.svg
      ?.selectAll<SVGGElement, SankeyNode<Node, Link>>('.flow-node-icon')
      .style('opacity', (node) =>
        nodeIds && !nodeIds.has(node.id) ? 0.16 : 1,
      );
    this.svg
      ?.selectAll<SVGGElement, Link>('.flow-link, .flow-link-label')
      .style('opacity', (link, index) =>
        linkIds && !linkIds.has(flowLinkId(link, index)) ? 0.12 : 1,
      );
    const cy = this.cy;
    cy?.batch(() => {
      cy.elements().removeClass('flow-dimmed flow-focused-target');
      cy.nodes().forEach((node) => {
        if (nodeIds && !nodeIds.has(node.id())) node.addClass('flow-dimmed');
        if (isTarget(node.data() as Node)) node.addClass('flow-focused-target');
      });
      cy.edges().forEach((edge) => {
        if (linkIds && !linkIds.has(edge.data('focusId') as string))
          edge.addClass('flow-dimmed');
      });
    });
    this.ref.markForCheck();
  }

  rebuildSankey(flowData: FlowData, flowSettings: FlowSettings): void {
    let skGraph = this.getLayout(
      flowData,
      flowSettings.sankeyAlign,
      800,
      this.height,
    );
    const columns = Math.max(...skGraph.nodes.map((d) => coalesce(d.depth, 0)));
    const width = (columns + 1) * NODE_WIDTH + columns * NODE_WIDTH * 8;
    const height = Math.min(this.height, width * 0.75);
    skGraph = this.getLayout(flowData, flowSettings.sankeyAlign, width, height);

    const svg = select(this.svgElement().nativeElement)
      .append('svg')
      .attr('viewBox', `0 0 ${width.toString()} ${height.toString()}`);

    svg.call(
      zoom<SVGSVGElement, unknown>().on(
        'zoom',
        (e: { transform: string }): void => {
          svg.selectAll('svg > g').attr('transform', e.transform);
        },
      ),
    );

    // Draw linkages (draw first so rects are drawn over them)
    const link = svg
      .append('g')
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.6)
      .style('will-change', 'opacity')
      .selectAll('g')
      .data(skGraph.links)
      .join('g')
      .attr('class', 'flow-link')
      .style('mix-blend-mode', 'multiply');

    const path = link
      .append('path')
      .attr('id', (l) => l.index)
      .attr('d', (l) =>
        (l as SankeyLinkExtraProperties).direction === 'forward'
          ? sankeyLinkHorizontal()(l)
          : sankeyLinkLoop(
              coalesce(l.width, 0),
              NODE_WIDTH,
              (l.source as SankeyNode<Node, Link>).y1,
              (l.target as SankeyNode<Node, Link>).y1,
            )(l),
      )
      .attr('stroke', (l) => l.color)
      .attr('stroke-width', (l) => Math.max(1, coalesce(l.width, 0)));

    link.append('title').text((l) => l.name);

    svg
      .append('g')
      .selectAll('text')
      .data(skGraph.links)
      .join('text')
      .attr('class', 'flow-link-label')
      .append('textPath')
      .attr('startOffset', '4px')
      .attr('href', (l) => `#${l.index.toString()}`)
      .text((l) => `${l.text} ${l.name}`);

    // For use inside drag function
    const layout = this.skLayout;

    // Draw rects for nodes
    svg
      .append('g')
      .attr('stroke', 'var(--surface-border)')
      .selectAll<SVGRectElement, SankeyNode<Node, Link>>('rect')
      .data(skGraph.nodes)
      .join('rect')
      .attr('x', (d) => coalesce(d.x0, 0))
      .attr('y', (d) => coalesce(d.y0, 0))
      .attr('height', (d) => this.nodeHeight(d))
      .attr('width', (d) => coalesce(d.x1, 0) - coalesce(d.x0, 0))
      .attr('fill', (d) => d.color)
      .classed('flow-warehouse-node', (d) => !!d.warehouse)
      .on('click', (e: Event, d) => {
        if (e.defaultPrevented) return;
        this.selectNode(d);
      })
      .call(
        drag<SVGRectElement, SankeyNode<Node, Link>>()
          .subject((d) => d as SankeyNode<Node, Link>)
          .on('drag', function (this, event: { dy: number; dx: number }, d) {
            const rectY = parseFloat(select(this).attr('y'));
            const rectX = parseFloat(select(this).attr('x'));
            d.y0 = coalesce(d.y0, 0) + event.dy;
            d.y1 = coalesce(d.y1, 0) + event.dy;
            d.x0 = coalesce(d.x0, 0) + event.dx;
            d.x1 = coalesce(d.x1, 0) + event.dx;
            const trX = coalesce(d.x0, 0) - rectX;
            const trY = coalesce(d.y0, 0) - rectY;
            const transform = `translate(${trX.toString()},${trY.toString()})`;
            select(this).attr('transform', transform);

            // also move the image
            select(`[id='image-${d.id}']`).attr('transform', transform);
            if (layout) {
              layout.update(skGraph);
            }

            // force an update of the path
            path.attr('d', (l) => {
              if ((l as SankeyLinkExtraProperties).direction === 'forward')
                return sankeyLinkHorizontal()(l);

              const source = l.source as SankeyNode<Node, Link>;
              const target = l.target as SankeyNode<Node, Link>;

              return sankeyLinkLoop(
                coalesce(l.width, 0),
                NODE_WIDTH,
                source.y1,
                target.y1,
              )(l);
            });
          }),
      )
      .append('title')
      .text((d) =>
        d.warehouse || d.publicSupply ? `${d.name}\n${d.text}` : d.name,
      );

    // Draw icons (for rect height >= 16px)
    svg
      .append('g')
      .selectAll('svg')
      .data(skGraph.nodes.filter((d) => this.nodeHeight(d) >= 16))
      .join('g')
      .attr('class', 'flow-node-icon')
      .attr('id', (d) => `image-${d.id}`)
      .append('svg')
      .attr('viewBox', (d) => d.viewBox)
      .attr('width', (d) => Math.min(30, this.nodeHeight(d) - 2))
      .attr('height', (d) => Math.min(30, this.nodeHeight(d) - 2))
      .attr(
        'x',
        (d) =>
          (coalesce(d.x1, 0) + coalesce(d.x0, 0)) / 2 -
          Math.min(30, this.nodeHeight(d) - 2) / 2,
      )
      .attr(
        'y',
        (d) =>
          (coalesce(d.y1, 0) + coalesce(d.y0, 0)) / 2 -
          Math.min(30, this.nodeHeight(d) - 2) / 2,
      )
      .style('pointer-events', 'none')
      .append('image')
      .attr('href', (d) => coalesce(d.href, ''));

    this.svg = svg;
  }

  rebuildBoxLine(flow: FlowData): void {
    const nodes = flow.nodes.map((n) => ({
      id: n.id,
      data: n,
    }));
    const links = flow.links.map((l, index) => ({
      data: {
        id: flowLinkId(l, index),
        focusId: flowLinkId(l, index),
        source: l.source,
        target: l.target,
        value: l.value,
        color: l.color,
        label: `${l.text}\n${l.name}`,
      },
    }));
    const max = Math.max(...flow.links.map((l) => l.value));
    const color =
      getComputedStyle(this.svgElement().nativeElement).getPropertyValue(
        '--text-color',
      ) || 'black';
    const primaryColor =
      getComputedStyle(this.svgElement().nativeElement).getPropertyValue(
        '--primary-color',
      ) || color;
    const layout = {
      name: 'elk',
      fit: true,
      elk: {
        algorithm: 'layered',
        'spacing.nodeNode': 50,
        'spacing.nodeNodeBetweenLayers': 100,
      },
    } as unknown as cytoscape.LayoutOptions; // Elk layout unrecognized
    const textOutline = {
      'text-outline-color': 'white',
      'text-outline-opacity': 0.6,
      'text-outline-width': '0.75px',
    };
    const container =
      this.svgElement().nativeElement.ownerDocument.createElement('div');
    container.className = 'flow-box-chart';
    this.svgElement().nativeElement.appendChild(container);
    this.cy = cytoscape({
      container,
      elements: [...nodes, ...links],
      wheelSensitivity: 0.1,
      style: [
        {
          selector: 'node',
          style: {
            shape: 'round-rectangle',
            height: '64px',
            width: '64px',
            // @ts-expect-error Missing type
            'outline-color': 'data(color)',
            'outline-width': '4px',
            'background-color': 'data(color)',
            'background-image': 'data(href)',
            'background-position-x': 'data(posX)',
            'background-position-y': 'data(posY)',
            label: 'data(text)',
            color,
            'font-size': '17px',
            ...textOutline,
            'text-valign': 'bottom',
            'text-margin-y': 6,
          },
        },
        {
          selector: 'edge',
          style: {
            width: `mapData(value, 0, ${max.toString()}, 1, 16)`,
            label: 'data(label)',
            'text-rotation': 'autorotate',
            color,
            'font-size': '15px',
            ...textOutline,
            'text-wrap': 'wrap',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'control-point-step-size': 96,
          },
        },
        {
          selector: 'node[warehouse]',
          style: {
            'border-style': 'dashed',
            'border-width': 3,
            'border-color': color,
            'text-wrap': 'wrap',
          },
        },
        {
          selector: 'node[publicSupply]',
          style: { 'text-wrap': 'wrap' },
        },
        {
          selector: '.flow-dimmed',
          style: { opacity: 0.16, 'text-opacity': 0.16 },
        },
        {
          selector: '.flow-focused-target',
          style: { 'border-width': 3, 'border-color': primaryColor },
        },
      ],
      layout,
    });

    const cy = this.cy;
    this.pendingLayouts.add(cy);
    cy.one('layoutstop', () => this.pendingLayouts.delete(cy));

    this.cy.nodes().on('click', (e) => {
      this.selectNode((e.target as { data: () => Node }).data());
    });
  }

  getLayout(
    data: FlowData,
    align: SankeyAlign,
    width: number,
    height: number,
  ): SankeyGraph<Node, Link> {
    this.skLayout = sankey<Node, Link>()
      .nodeId((d) => d.id)
      .nodeWidth(NODE_WIDTH)
      .nodeAlign(this.getAlign(align))
      .extent([
        [1, 5],
        [width - 1, height - 5],
      ]);

    return this.skLayout({
      nodes: data.nodes
        .filter((n) =>
          data.links.some((l) => l.source === n.id || l.target === n.id),
        )
        .map((d) => spread(d)),
      links: data.links.map((l, index) => ({ ...l, id: flowLinkId(l, index) })),
    });
  }

  getAlign(
    align: SankeyAlign | undefined,
  ): (node: SankeyNode<Node, Link>, n: number) => number {
    switch (align) {
      case SankeyAlign.Left:
        return sankeyLeft;
      case SankeyAlign.Right:
        return sankeyRight;
      case SankeyAlign.Center:
        return sankeyCenter;
      default:
        return sankeyJustify;
    }
  }

  nodeHeight(d: SankeyNode<Node, Link>): number {
    return coalesce(d.y1, 0) - coalesce(d.y0, 0);
  }

  // istanbul ignore next: Don't test dependencies (file-saver/cytoscape)
  saveCytoscapePng(cy: cytoscape.Core): void {
    saveAs(cy.png(), 'endfield-calc_flow.png');
  }
}
