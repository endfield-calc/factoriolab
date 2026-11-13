import {
  ApplicationRef,
  computed,
  effect,
  inject,
  Service,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
} from '@angular/router';
import {
  catchError,
  combineLatest,
  defer,
  EMPTY,
  filter,
  from,
  map,
  merge,
  Subject,
  switchMap,
  take,
  takeWhile,
  tap,
} from 'rxjs';

import { Game } from '~/data/game';
import { gameInfo } from '~/data/game-info';
import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';
import { PRESENTATION_EXTENSION } from '~/extensions/presentation-extension';
import {
  cloneDefaults,
  EFFECTIVE_DEFAULTS,
  PRODUCT_PROFILE,
} from '~/extensions/product-profile';
import {
  RestoreDiagnostic,
  RestorePlan,
  STATE_EXTENSION,
  WorkspaceRestoreError,
} from '~/extensions/state-extension';
import { WorkspaceLifecycle } from '~/extensions/workspace-lifecycle';
import { WorkspacePreparation } from '~/extensions/workspace-preparation';
import { rational } from '~/rational/rational';
import { Step } from '~/solver/step';
import { asString } from '~/utils/coercion';
import { coalesce } from '~/utils/nullish';
import { prune, spread } from '~/utils/object';
import { storedSignal } from '~/utils/stored-signal';

import { BeaconSettings } from '../beacon-settings';
import { ItemState } from '../items/item-state';
import { ItemsStore } from '../items/items-store';
import { MachineState } from '../machines/machine-state';
import { MachinesStore } from '../machines/machines-store';
import { ModuleSettings } from '../module-settings';
import { isRecipeObjective, ObjectiveState } from '../objectives/objective';
import { ObjectiveType } from '../objectives/objective-type';
import { ObjectiveUnit } from '../objectives/objective-unit';
import { ObjectivesStore } from '../objectives/objectives-store';
import { RecipeState } from '../recipes/recipe-state';
import { RecipesStore } from '../recipes/recipes-store';
import { CostSettings } from '../settings/cost-settings';
import { Dataset } from '../settings/dataset';
import {
  PartialSettingsState,
  SettingsState,
} from '../settings/settings-state';
import { SettingsStore } from '../settings/settings-store';
import { initialTableState, TableState } from '../table/table-state';
import { TableStore } from '../table/table-store';
import { Compression } from './compression';
import { ZFIELDSEP } from './constants';
import { LabParams } from './lab-params';
import { Migration } from './migration';
import { Params } from './params';
import { Zip } from './zip';
import { ZipData } from './zip-data';
import { ZipVersion } from './zip-version';

export const MIN_ZIP = 200;

interface ZipRecipeSettingsInfo {
  idMap: Record<string, number>;
  list: ZipData[];
}

export interface ZipMachineSettings {
  moduleMap: Record<string, number[]>;
  beaconMap: Record<string, number[]>;
}

export interface ZipState {
  objectives: ZipData<LabParams>;
  config: ZipData<LabParams>;
  objectiveSettings: ZipMachineSettings;
  recipeSettings: ZipMachineSettings;
  machineSettings: ZipMachineSettings;
  beacons?: number[];
}

interface State {
  objectives: Record<string, ObjectiveState>;
  items: Record<string, ItemState>;
  recipes: Record<string, RecipeState>;
  machines: Record<string, MachineState>;
  settings: SettingsState;
  table: TableState;
  data: Dataset;
  hash: ModHash;
  extension?: unknown;
}

interface LiveSnapshot {
  objectives: Record<string, ObjectiveState>;
  items: Record<string, ItemState>;
  recipes: Record<string, RecipeState>;
  machines: Record<string, MachineState>;
  settings: SettingsState;
  table: TableState;
  extension: unknown;
}

interface NavigationStatus {
  readonly ready: boolean;
  readonly lifecycleReady: boolean;
  readonly diagnostics: readonly RestoreDiagnostic[];
  readonly originalInput: string;
  readonly retry?: RouteInput;
}

interface Settlement {
  readonly ticket: number;
  readonly status: NavigationStatus;
}

interface RouteInput {
  readonly params: Params;
  readonly queryParams: Params;
}

export interface PartialState {
  objectivesState?: Record<string, ObjectiveState>;
  itemsState?: Record<string, ItemState>;
  recipesState?: Record<string, RecipeState>;
  machinesState?: Record<string, MachineState>;
  settingsState?: PartialSettingsState;
  tableState?: Partial<TableState>;
}

@Service()
export class RouterSync {
  private readonly appRef = inject(ApplicationRef);
  private readonly router = inject(Router);
  private readonly compression = inject(Compression);
  private readonly itemsStore = inject(ItemsStore);
  private readonly machinesStore = inject(MachinesStore);
  private readonly migration = inject(Migration);
  private readonly objectivesStore = inject(ObjectivesStore);
  private readonly recipesStore = inject(RecipesStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly tableStore = inject(TableStore);
  private readonly zip = inject(Zip);
  private readonly extension = inject(STATE_EXTENSION);
  private readonly presentation = inject(PRESENTATION_EXTENSION);
  private readonly lifecycle = inject(WorkspaceLifecycle);
  private readonly preparation = inject(WorkspacePreparation);
  private readonly effectiveDefaults = inject(EFFECTIVE_DEFAULTS);
  private readonly product = inject(PRODUCT_PROFILE);

  private readonly state = new Subject<State>();
  readonly zipConfig = signal(this.empty);
  // Current hashing algorithm version
  private readonly version = ZipVersion.Version12;
  private readonly zipTail: LabParams = { v: this.version };
  readonly route$ = new Subject<ActivatedRoute>();
  private readonly ready = signal(false);
  readonly stored = storedSignal('router');

  private readonly resources = toObservable(
    computed(() => ({
      modId: this.settingsStore.modId(),
      data: this.settingsStore.modData(),
      hash: this.settingsStore.modHash(),
      loading: this.settingsStore.loading(),
      error: this.settingsStore.loadError(),
    })),
  );
  private activeTicket?: number;
  private writeSequence = 0;
  private stable?: LiveSnapshot;
  private readonly navigationPending = signal(false);
  private navigationId?: number;
  private navigationStatus?: NavigationStatus;
  private settlement?: Settlement;
  private navigationHadRoute = false;
  private readonly retryRestore = new Subject<RouteInput>();
  private lastRouteInput?: RouteInput;
  private restoring = false;
  private workspaceRoute?: ActivatedRoute;
  private workspaceScope = false;

  get empty(): ZipData<LabParams> {
    return { bare: {}, hash: {} };
  }

  get emptyRecipeSettingsInfo(): ZipRecipeSettingsInfo {
    return { idMap: {}, list: [] };
  }

  get emptyMachineSettings(): ZipMachineSettings {
    return { moduleMap: {}, beaconMap: {} };
  }

  constructor() {
    this.router.events
      .pipe(takeWhile(() => !this.appRef.destroyed))
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          const info = this.router.currentNavigation()?.extras.info as
            | { sync?: true }
            | undefined;
          if (!info?.sync) this.beginNavigation(event);
        } else if (
          event instanceof NavigationSkipped &&
          this.navigationPending()
        ) {
          // A redirect or superseding navigation may be ignored before it emits
          // NavigationStart (for example, when it targets the current URL).
          this.cancelNavigation();
        } else if (
          (event instanceof NavigationEnd ||
            event instanceof NavigationCancel ||
            event instanceof NavigationError) &&
          event.id === this.navigationId
        ) {
          if (event instanceof NavigationEnd) this.finishNavigation(event);
          else if (event instanceof NavigationCancel) {
            if (
              event.code !== NavigationCancellationCode.Redirect &&
              event.code !==
                NavigationCancellationCode.SupersededByNewNavigation
            )
              this.cancelNavigation();
          } else if (event instanceof NavigationError) this.cancelNavigation();
        }
      });

    const externalRoutes = this.route$.pipe(
      tap((route) => {
        this.workspaceRoute = route;
        this.workspaceScope = true;
      }),
      switchMap((r) =>
        combineLatest({
          params: r.params,
          queryParams: r.queryParams,
        }),
      ),
      /** Skip any navigations triggered by `RouterSync.updateUrl` */
      filter(
        () =>
          this.workspaceScope &&
          !(
            this.router.currentNavigation()?.extras.info as
              | { sync?: true }
              | undefined
          )?.sync,
      ),
    );
    merge(externalRoutes, this.retryRestore)
      .pipe(
        takeWhile(() => !this.appRef.destroyed),
        tap(({ params, queryParams }) => {
          if (this.navigationPending()) this.navigationHadRoute = true;
          this.lastRouteInput = {
            params: { ...params },
            queryParams: { ...queryParams },
          };
        }),
        switchMap(({ params, queryParams }) => {
          const wasReady = this.lifecycle.ready();
          const ticket = this.lifecycle.begin(this.router.url);
          this.activeTicket = ticket;
          this.writeSequence++;
          this.ready.set(false);
          this.restoring = true;
          return defer(() => {
            if ((!this.navigationPending() && wasReady) || this.stable == null)
              this.stable = this.snapshot();
            return from(this.unzipQueryParams(queryParams));
          }).pipe(
            filter(() => this.lifecycle.current(ticket)),
            map((unpacked) => {
              const plan = this.extension.prepare({
                modId: params['id'] as string | undefined,
                params: unpacked,
              });
              const migrated = this.migration.migrate(
                plan.modId,
                plan.params,
                plan.legacyModHashes,
              );
              return { plan, migrated };
            }),
            switchMap(({ plan, migrated }) => {
              if (!this.lifecycle.current(ticket)) return EMPTY;
              if (
                this.product.allowedModIds != null &&
                (migrated.modId == null ||
                  !this.product.allowedModIds.includes(migrated.modId))
              )
                throw new WorkspaceRestoreError([
                  {
                    code: 'mod-not-allowed',
                    message: `Workspace mod is not available: ${migrated.modId ?? '(missing)'}`,
                    field: 'modId',
                    severity: 'error',
                  },
                ]);
              let retryError: unknown;
              let retried = false;
              if (this.settingsStore.modId() !== migrated.modId) {
                this.settingsStore.apply({ modId: migrated.modId });
                this.appRef.tick();
              } else if (this.settingsStore.loadError() != null) {
                retryError = this.settingsStore.loadError();
                retried = this.settingsStore.retryFailedResources();
                if (retried) this.appRef.tick();
                else retried = this.settingsStore.loading();
              }
              return this.resources.pipe(
                filter((resources) => {
                  if (
                    !this.lifecycle.current(ticket) ||
                    resources.modId !== migrated.modId
                  )
                    return false;
                  if (retried) {
                    if (
                      resources.modId !== this.settingsStore.modId() ||
                      resources.loading !== this.settingsStore.loading() ||
                      resources.error !== this.settingsStore.loadError() ||
                      resources.data !== this.settingsStore.modData() ||
                      resources.hash !== this.settingsStore.modHash() ||
                      resources.error === retryError
                    )
                      return false;
                  }
                  return (
                    resources.error != null ||
                    (!resources.loading &&
                      resources.data != null &&
                      resources.hash != null)
                  );
                }),
                take(1),
                tap((resources) => {
                  if (resources.error != null) throw resources.error;
                  // The filter admits a non-error result only with both values.
                  const { data, hash } = resources as typeof resources & {
                    data: ModData;
                    hash: ModHash;
                  };
                  this.updateState(
                    migrated.modId,
                    migrated.params,
                    migrated.isBare,
                    data,
                    hash,
                    plan,
                    ticket,
                  );
                }),
              );
            }),
            catchError((error: unknown) => {
              this.failRestore(ticket, error);
              return EMPTY;
            }),
          );
        }),
      )
      .subscribe();

    effect(() => {
      const ready = this.ready();
      const lifecycleReady = this.lifecycle.ready();
      const navigationPending = this.navigationPending();
      const hash = this.settingsStore.modHash();
      if (!ready || !lifecycleReady || navigationPending || !hash) return;
      const objectives = this.objectivesStore.state();
      const items = this.itemsStore.state();
      const recipes = this.recipesStore.state();
      const machines = this.machinesStore.state();
      const settings = this.settingsStore.state();
      const table = this.tableStore.state();
      const data = this.settingsStore.dataset();
      const extension = this.extension.snapshot();

      this.state.next({
        objectives,
        items,
        recipes,
        machines,
        settings,
        table,
        data,
        hash,
        extension,
      });
    });

    this.state
      .pipe(
        switchMap((state) => {
          const ticket = this.activeTicket;
          try {
            const zipped = this.zipState(state);
            this.zipConfig.set(zipped.config);
            return from(this.updateUrl(zipped, ticket)).pipe(
              catchError((error: unknown) => {
                if (ticket != null) this.failRestore(ticket, error);
                return EMPTY;
              }),
            );
          } catch (error) {
            if (ticket != null) this.failRestore(ticket, error);
            return EMPTY;
          }
        }),
      )
      .subscribe();
  }

  setGame(game: Game, commands?: string[]): Promise<boolean> {
    return this.setMod(gameInfo[game].modId, commands);
  }

  setMod(modId: string, commands: string[] = []): Promise<boolean> {
    return this.router.navigate([modId, ...commands]);
  }

  private beginNavigation(event: NavigationStart): void {
    const alreadyPending = this.navigationPending();
    const wasReady = this.lifecycle.ready();
    if (!alreadyPending || this.navigationStatus == null) {
      const settlement = this.settlement;
      this.navigationStatus =
        settlement != null && this.lifecycle.current(settlement.ticket)
          ? settlement.status
          : {
              ready: this.ready(),
              lifecycleReady: wasReady,
              diagnostics: this.lifecycle.diagnostics(),
              originalInput: this.lifecycle.originalInput(),
              retry: this.restoring ? this.lastRouteInput : undefined,
            };
    }
    this.navigationId = event.id;
    this.navigationHadRoute = false;
    this.navigationPending.set(true);
    const ticket = this.lifecycle.begin(event.url);
    this.activeTicket = ticket;
    this.writeSequence++;
    this.ready.set(false);
    this.restoring = false;
    if (!alreadyPending && (wasReady || this.stable == null)) {
      try {
        this.stable = this.snapshot();
      } catch (error) {
        this.failRestore(ticket, error);
      }
    }
  }

  private finishNavigation(event: NavigationEnd): void {
    if (this.workspaceRoute != null && !this.isWorkspaceRouteActive()) {
      this.leaveWorkspace(event.urlAfterRedirects);
      return;
    }
    if (!this.navigationHadRoute) {
      this.cancelNavigation(event.urlAfterRedirects);
      return;
    }
    this.navigationId = undefined;
    this.navigationStatus = undefined;
    this.navigationPending.set(false);
  }

  private isWorkspaceRouteActive(): boolean {
    const routes = [this.router.routerState.root];
    while (routes.length) {
      const route = routes.pop();
      if (route === this.workspaceRoute) return true;
      if (route != null) routes.push(...route.children);
    }
    return false;
  }

  private leaveWorkspace(originalInput: string): void {
    this.workspaceScope = false;
    this.navigationId = undefined;
    this.navigationStatus = undefined;
    const ticket = this.lifecycle.begin(originalInput);
    this.activeTicket = ticket;
    this.writeSequence++;
    this.ready.set(false);
    this.restoring = false;
    const settlement: Settlement = {
      ticket,
      status: {
        ready: false,
        lifecycleReady: false,
        diagnostics: [],
        originalInput,
      },
    };
    this.settlement = settlement;
    try {
      if (this.stable != null) this.restoreSnapshot(this.stable);
      if (!this.lifecycle.current(ticket)) return;
      this.stable = undefined;
    } catch (error) {
      if (!this.lifecycle.current(ticket)) return;
      this.failRestore(ticket, error);
    } finally {
      if (this.settlement === settlement) this.settlement = undefined;
    }
    if (!this.lifecycle.current(ticket)) return;
    this.navigationPending.set(false);
  }

  private cancelNavigation(originalInput?: string): void {
    const status = this.navigationStatus;
    this.navigationId = undefined;
    this.navigationStatus = undefined;
    if (status == null) {
      this.navigationPending.set(false);
      return;
    }
    const target = {
      ...status,
      originalInput: originalInput ?? status.originalInput,
    };
    const ticket = this.lifecycle.begin(target.originalInput);
    this.activeTicket = ticket;
    this.writeSequence++;
    const settlement: Settlement = { ticket, status: target };
    this.settlement = settlement;
    let restored = false;
    try {
      if (this.stable != null) this.restoreSnapshot(this.stable);
      if (!this.lifecycle.current(ticket)) return;
      if (target.lifecycleReady)
        this.lifecycle.complete(ticket, target.diagnostics);
      else this.lifecycle.fail(ticket, target.diagnostics);
      this.ready.set(target.ready);
      if (target.retry == null) this.stable = undefined;
      restored = true;
    } catch (error) {
      if (!this.lifecycle.current(ticket)) return;
      this.failRestore(ticket, error);
    } finally {
      if (this.settlement === settlement) this.settlement = undefined;
    }
    if (!this.lifecycle.current(ticket)) return;
    this.navigationPending.set(false);
    if (restored && target.retry != null && this.lifecycle.current(ticket))
      this.retryRestore.next(target.retry);
  }

  private errorMessage(error: unknown): string {
    if (
      typeof error === 'object' &&
      error != null &&
      'message' in error &&
      typeof error.message === 'string'
    )
      return error.message;
    return typeof error === 'string' ? error : 'Workspace restoration failed';
  }

  private snapshot(): LiveSnapshot {
    return {
      objectives: this.objectivesStore.state(),
      items: this.itemsStore.state(),
      recipes: this.recipesStore.state(),
      machines: this.machinesStore.state(),
      settings: this.settingsStore.state(),
      table: this.tableStore.state(),
      extension: this.extension.snapshot(),
    };
  }

  private restoreSnapshot(snapshot: LiveSnapshot): void {
    this.objectivesStore.set(snapshot.objectives);
    this.itemsStore.set(snapshot.items);
    this.recipesStore.set(snapshot.recipes);
    this.machinesStore.set(snapshot.machines);
    this.settingsStore.set(snapshot.settings);
    this.tableStore.set(snapshot.table);
    this.extension.commit(snapshot.extension);
  }

  private failRestore(ticket: number, error: unknown): void {
    if (!this.lifecycle.current(ticket)) return;
    this.restoring = false;
    const diagnostics: RestoreDiagnostic[] =
      error instanceof WorkspaceRestoreError
        ? [...error.diagnostics]
        : [
            {
              code: 'workspace-restore',
              message: this.errorMessage(error),
              severity: 'error',
            },
          ];
    const settlement: Settlement = {
      ticket,
      status: {
        ready: false,
        lifecycleReady: false,
        diagnostics,
        originalInput: this.lifecycle.originalInput(),
      },
    };
    this.settlement = settlement;
    let rollbackError: unknown;
    try {
      if (this.stable != null) this.restoreSnapshot(this.stable);
      if (!this.lifecycle.current(ticket)) return;
    } catch (cause) {
      if (!this.lifecycle.current(ticket)) return;
      rollbackError = cause;
    } finally {
      if (this.settlement === settlement) this.settlement = undefined;
    }
    if (rollbackError != null)
      diagnostics.push({
        code: 'workspace-rollback',
        message:
          rollbackError instanceof Error
            ? rollbackError.message
            : typeof rollbackError === 'string'
              ? rollbackError
              : 'Failed to restore the previous workspace',
        severity: 'error',
      });
    this.ready.set(false);
    this.lifecycle.fail(ticket, diagnostics);
  }

  async updateUrl(zState: ZipState, ticket?: number): Promise<void> {
    const sequence = ++this.writeSequence;
    const current = (): boolean =>
      ticket == null ||
      (this.lifecycle.current(ticket) &&
        this.lifecycle.ready() &&
        this.ready() &&
        !this.navigationPending() &&
        sequence === this.writeSequence);
    const queryParams = await this.getHash(zState);
    if (!current()) return;
    const navigated = await this.router.navigate([], {
      queryParams,
      preserveFragment: true,
      // Use sync: true to indicate we should not re-apply this state
      info: { sync: true },
    });
    if (!current() || !navigated) return;

    // Cache url state unless on the landing page, check via number of /
    const pathSegments = this.router.url.split('/');
    if (pathSegments.length > 2) this.stored.set(this.router.url);
  }

  zipState(state: State): ZipState {
    const {
      objectives,
      items,
      recipes,
      machines,
      settings,
      table,
      data,
      hash,
      extension,
    } = state;
    const zState = this.zipModulesBeacons(
      objectives,
      recipes,
      machines,
      settings,
      hash,
    );

    this.zipObjectives(zState, objectives, hash);
    this.zipItems(zState, items, hash);
    this.zipRecipes(zState, recipes, hash);
    this.zipMachines(zState, machines, hash);
    this.zipSettings(zState, settings, Object.keys(objectives), data, hash);
    this.zipTable(zState, table);
    const extensionParams = this.extension.encode(extension);
    Object.assign(zState.config.bare as Params, extensionParams);
    Object.assign(zState.config.hash as Params, extensionParams);
    return zState;
  }

  async stepHref(
    step: Step,
    config: ZipData<LabParams>,
  ): Promise<LabParams | null> {
    const hash = this.settingsStore.modHash();
    if (hash == null) return null;

    let objectives: Record<string, ObjectiveState> | undefined;
    const workspaceLink = this.presentation.workspaceLink(step);
    if (workspaceLink) {
      objectives = this.objectivesStore.state();
    } else if (step.itemId != null && step.items != null) {
      objectives = {
        ['1']: {
          id: '1',
          targetId: step.itemId,
          value: step.items,
          unit: ObjectiveUnit.Items,
          type: ObjectiveType.Output,
        },
      };
    } else if (step.recipeId != null && step.machines != null) {
      objectives = {
        ['1']: {
          id: '1',
          targetId: step.recipeId,
          value: step.machines,
          unit: ObjectiveUnit.Machines,
          type: ObjectiveType.Output,
        },
      };
    }

    if (objectives == null) return null;

    const stepConfig: ZipData<LabParams> = workspaceLink
      ? config
      : { bare: { ...config.bare }, hash: { ...config.hash } };
    if (!workspaceLink) {
      delete stepConfig.bare.och;
      delete stepConfig.hash.och;
    }
    const zState: ZipState = workspaceLink
      ? this.zipModulesBeacons(
          objectives,
          this.recipesStore.state(),
          this.machinesStore.state(),
          this.settingsStore.state(),
          hash,
        )
      : {
          objectives: this.empty,
          config: stepConfig,
          objectiveSettings: this.emptyMachineSettings,
          recipeSettings: this.emptyMachineSettings,
          machineSettings: this.emptyMachineSettings,
        };

    if (workspaceLink) zState.config = stepConfig;

    this.zipObjectives(zState, objectives, hash);
    return await this.getHash(zState);
  }

  async getHashParams(hash: LabParams): Promise<LabParams> {
    const hashStr = this.toString(hash as Params);
    const zStr = await this.compression.deflate(hashStr);
    return {
      z: zStr,
      v: this.version,
    };
  }

  async getHash(zState: ZipState): Promise<LabParams> {
    const bare = spread(
      zState.objectives.bare,
      zState.config.bare,
      this.zipTail,
    );

    const hash = spread(
      zState.objectives.hash,
      zState.config.hash,
      this.zipTail,
    );
    const zip = await this.getHashParams(hash);

    const bareStr = this.toString(bare as Params);
    const bareLen = bareStr.length;
    const zipStr = this.toString(zip as Params);
    const zipLen = zipStr.length;
    return bareLen < Math.max(zipLen, MIN_ZIP) ? bare : zip;
  }

  toParams(value: string): Params {
    const sections = value.split('&');
    if (sections.some((s) => !s.includes('='))) {
      // Need to parse out < V11 hashed state without '=' delimiter
      return sections.reduce((e: Params, v) => {
        e[v[0]] = v.substring(1);
        return e;
      }, {});
    }
    return sections.reduce((e: Params, v) => {
      const [key, value] = v.split('=');
      if (e[key] == null) e[key] = value;
      else if (Array.isArray(e[key])) e[key].push(value);
      else e[key] = [e[key], value];
      return e;
    }, {});
  }

  toString(value: Params): string {
    return Object.keys(value)
      .flatMap((k) => {
        const v = value[k];
        if (Array.isArray(v)) return v.map((e) => `${k}=${e}`);
        else if (v) return `${k}=${v}`;
        return [];
      }, '')
      .join('&');
  }

  async unzipQueryParams(queryParams: Params): Promise<Params> {
    const zip = queryParams['z'];
    const outerVersion = queryParams['v'];
    if (zip != null) {
      try {
        // Upgrade V0 query-unsafe zipped characters
        const zSafe = asString(zip)
          .replace(/\+/g, '-')
          .replace(/\//g, '.')
          .replace(/=/g, '_');
        const unzip = await this.compression.inflate(zSafe);
        queryParams = this.toParams(unzip);
        queryParams['z'] = zip;
        if (outerVersion != null) queryParams['v'] = outerVersion;
      } catch (err) {
        console.error(err);
        throw new WorkspaceRestoreError([
          {
            code: 'invalid-compression',
            message: 'RouterService failed to parse url',
            field: 'z',
            severity: 'error',
          },
        ]);
      }
    }
    return queryParams;
  }

  updateState(
    modId: string | undefined,
    params: LabParams,
    isBare: boolean,
    modData: ModData,
    modHash: ModHash,
    plan?: RestorePlan,
    ticket?: number,
  ): void {
    if (modId == null && Object.keys(params).length === 0) {
      // Nothing to set up
      this.ready.set(true);
      return;
    }

    const decodeHash = plan?.hash ?? modHash;
    const hash = isBare ? undefined : decodeHash;
    const ms = this.unzipModules(params, hash);
    const bs = this.unzipBeacons(params, ms, hash);
    const state: PartialState = {};
    state.objectivesState = this.unzipObjectives(params, ms, bs, hash);
    state.itemsState = this.unzipItems(params, hash);
    state.recipesState = this.unzipRecipes(params, ms, bs, hash);
    state.machinesState = this.unzipMachines(params, ms, bs, hash);
    const objectiveIds = state.objectivesState
      ? Object.keys(state.objectivesState)
      : [];
    state.settingsState = this.unzipSettings(
      modId,
      params,
      bs,
      objectiveIds,
      modData,
      decodeHash,
      hash,
    );
    state.tableState = this.unzipTable(params);

    const restorePlan =
      plan ?? this.extension.prepare({ modId, params: params as Params });
    const objectiveIdsToPrepare = this.extension.preflight({
      state,
      plan: restorePlan,
      data: modData,
    });
    const preparedObjectives = objectiveIdsToPrepare.length
      ? this.preparation.prepareObjectives(
          state,
          modData,
          decodeHash,
          objectiveIdsToPrepare,
        )
      : undefined;
    const decoded = this.extension.decode({
      state,
      params,
      plan: restorePlan,
      data: modData,
      hash: decodeHash,
      preparedObjectives,
    });
    if (
      decoded.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
    )
      throw new WorkspaceRestoreError(decoded.diagnostics);
    if (ticket != null && !this.lifecycle.current(ticket)) return;
    const previous = this.stable ?? this.snapshot();
    try {
      this.dispatch(decoded.state, ticket == null);
      this.extension.commit(decoded.extension);
      if (ticket != null && !this.lifecycle.current(ticket)) return;
    } catch (error) {
      if (ticket != null && !this.lifecycle.current(ticket)) return;
      try {
        this.restoreSnapshot(previous);
      } catch (rollbackError) {
        if (ticket != null && !this.lifecycle.current(ticket)) return;
        throw new AggregateError(
          [error, rollbackError],
          'Workspace commit and rollback failed',
          { cause: rollbackError },
        );
      }
      if (ticket != null && !this.lifecycle.current(ticket)) return;
      throw error;
    }
    if (ticket != null) {
      this.lifecycle.complete(ticket, decoded.diagnostics);
      this.ready.set(true);
      this.restoring = false;
      if (!this.navigationPending()) this.stable = undefined;
    }
  }

  dispatch(state: PartialState, markReady = true): void {
    this.objectivesStore.load(state.objectivesState);
    this.itemsStore.load(state.itemsState);
    this.recipesStore.load(state.recipesState);
    this.machinesStore.load(state.machinesState);
    this.settingsStore.load(state.settingsState);
    this.tableStore.load(state.tableState);
    if (markReady) this.ready.set(true);
  }

  zipModulesBeacons(
    objectives: Record<string, ObjectiveState>,
    recipes: Record<string, RecipeState>,
    machines: Record<string, MachineState>,
    settings: SettingsState,
    hash: ModHash,
  ): ZipState {
    const modulesInfo = this.emptyRecipeSettingsInfo;
    const beaconsInfo = this.emptyRecipeSettingsInfo;

    const zip = (
      record: Record<string, ObjectiveState | RecipeState | MachineState>,
    ): ZipMachineSettings => {
      return this.zipMachineSettings(record, modulesInfo, beaconsInfo, hash);
    };
    const objectiveSettings = zip(objectives);
    const recipeSettings = zip(recipes);
    const machineSettings = zip(machines);

    let beacons: number[] | undefined;
    if (settings.beacons) {
      const moduleMap = this.beaconModuleMap(
        settings.beacons,
        modulesInfo,
        hash,
      );
      beacons = this.zipBeaconArray(
        settings.beacons,
        moduleMap,
        beaconsInfo,
        hash,
      );
    }

    const config = this.empty;
    const type = ['bare', 'hash'] as const;
    const data = [
      ['e', modulesInfo.list],
      ['b', beaconsInfo.list],
    ] as const;
    data.forEach(([section, list]) => {
      list.forEach((e) => {
        type.forEach((t) => {
          if (config[t][section] == null) config[t][section] = [e[t]];
          else config[t][section].push(e[t]);
        });
      });
    });

    return {
      objectives: this.empty,
      config,
      objectiveSettings,
      recipeSettings,
      machineSettings,
      beacons,
    };
  }

  zipMachineSettings(
    state: Record<string, ObjectiveState | RecipeState | MachineState>,
    modulesInfo: ZipRecipeSettingsInfo,
    beaconsInfo: ZipRecipeSettingsInfo,
    hash: ModHash,
  ): ZipMachineSettings {
    const result = this.emptyMachineSettings;
    for (const id of Object.keys(state)) {
      const value = state[id];
      if (value.modules != null) {
        result.moduleMap[id] = this.zipModuleArray(
          value.modules,
          modulesInfo,
          hash,
        );
      }

      if (value.beacons != null) {
        const moduleMap = this.beaconModuleMap(
          value.beacons,
          modulesInfo,
          hash,
        );
        result.beaconMap[id] = this.zipBeaconArray(
          value.beacons,
          moduleMap,
          beaconsInfo,
          hash,
        );
      }
    }

    return result;
  }

  beaconModuleMap(
    beacons: BeaconSettings[],
    modulesInfo: ZipRecipeSettingsInfo,
    hash: ModHash,
  ): (number[] | undefined)[] {
    return beacons.map((beacon) => {
      if (beacon.modules == null) return;
      return this.zipModuleArray(beacon.modules, modulesInfo, hash);
    });
  }

  zipModuleArray(
    values: ModuleSettings[],
    modulesInfo: ZipRecipeSettingsInfo,
    hash: ModHash,
  ): number[] {
    return values.map((obj) => {
      const count = this.zip.zipRational(obj.count);
      const zip: ZipData = {
        bare: this.zip.zipFields([count, this.zip.zipString(obj.id)]),
        hash: this.zip.zipFields([
          count,
          this.zip.zipNString(obj.id, hash.modules),
        ]),
      };

      if (modulesInfo.idMap[zip.bare] == null) {
        modulesInfo.idMap[zip.bare] = modulesInfo.list.length;
        modulesInfo.list.push(zip);
      }

      return modulesInfo.idMap[zip.bare];
    });
  }

  unzipModules(params: LabParams, hash?: ModHash): ModuleSettings[] {
    if (params.e == null) return [];
    return params.e.map((module) => {
      const s = module.split(ZFIELDSEP);
      let i = 0;
      const obj: ModuleSettings = {
        count: this.zip.parseRational(s[i++]),
        id: this.zip.parseString(s[i], hash?.modules),
      };

      prune(obj);
      return obj;
    });
  }

  zipBeaconArray(
    beacons: BeaconSettings[],
    moduleMap: (number[] | undefined)[],
    beaconsInfo: ZipRecipeSettingsInfo,
    hash: ModHash,
  ): number[] {
    return beacons.map((obj, i) => {
      const count = this.zip.zipRational(obj.count);
      const modules = this.zip.zipArray(moduleMap[i]);
      const total = this.zip.zipRational(obj.total);
      const zip: ZipData = {
        bare: this.zip.zipFields([
          count,
          modules,
          this.zip.zipString(obj.id),
          total,
        ]),
        hash: this.zip.zipFields([
          count,
          modules,
          this.zip.zipNString(obj.id, hash.beacons),
          total,
        ]),
      };

      if (beaconsInfo.idMap[zip.bare] == null) {
        beaconsInfo.idMap[zip.bare] = beaconsInfo.list.length;
        beaconsInfo.list.push(zip);
      }

      return beaconsInfo.idMap[zip.bare];
    });
  }

  unzipBeacons(
    params: LabParams,
    moduleSettings: ModuleSettings[],
    hash?: ModHash,
  ): BeaconSettings[] {
    if (params.b == null) return [];
    return params.b.map((beacon) => {
      const s = beacon.split(ZFIELDSEP);
      let i = 0;
      const obj: BeaconSettings = {
        count: this.zip.parseRational(s[i++]),
        modules: this.zip.parseIndices(s[i++], moduleSettings),
        id: this.zip.parseString(s[i++], hash?.beacons),
        total: this.zip.parseRational(s[i]),
      };

      prune(obj);
      return obj;
    });
  }

  zipObjectives(
    data: ZipState,
    objectives: Record<string, ObjectiveState>,
    hash: ModHash,
  ): void {
    const ids = Object.keys(objectives);
    if (!ids.length) return;

    const list = ids.map((i) => objectives[i]);
    data.objectives.bare.o = [];
    data.objectives.hash.o = [];
    for (const obj of list) {
      const value = this.zip.zipDiffRational(obj.value, rational.one);
      const unit = this.zip.zipDiffNumber(obj.unit, ObjectiveUnit.Items);
      const type = this.zip.zipDiffNumber(obj.type, ObjectiveType.Output);
      const modules = this.zip.zipArray(
        data.objectiveSettings.moduleMap[obj.id],
      );
      const beacons = this.zip.zipArray(
        data.objectiveSettings.beaconMap[obj.id],
      );
      const overclock = this.zip.zipNumber(obj.overclock);

      data.objectives.bare.o.push(
        this.zip.zipFields([
          obj.targetId,
          value,
          unit,
          type,
          this.zip.zipString(obj.machineId),
          modules,
          beacons,
          overclock,
          this.zip.zipString(obj.fuelId),
        ]),
      );
      data.objectives.hash.o.push(
        this.zip.zipFields([
          this.zip.zipNString(
            obj.targetId,
            isRecipeObjective(obj) ? hash.recipes : hash.items,
          ),
          value,
          unit,
          type,
          this.zip.zipNString(obj.machineId, hash.machines),
          modules,
          beacons,
          overclock,
          this.zip.zipNString(obj.fuelId, hash.fuels),
        ]),
      );
    }
  }

  unzipObjectives(
    params: LabParams,
    moduleSettings: ModuleSettings[],
    beaconSettings: BeaconSettings[],
    hash?: ModHash,
  ): Record<string, ObjectiveState> | undefined {
    if (params.o == null) return;

    const state: Record<string, ObjectiveState> = {};
    let index = 1;
    for (const itemObjective of params.o) {
      const s = itemObjective.split(ZFIELDSEP);
      let i = 0;
      const id = index.toString();
      const obj: ObjectiveState = {
        id: index.toString(),
        targetId: s[i++], // Convert to real id after determining unit, if hashed
        value: coalesce(this.zip.parseRational(s[i++]), rational.one),
        unit: this.zip.parseNumber(s[i++]) ?? ObjectiveUnit.Items,
        type: this.zip.parseNumber(s[i++]) ?? ObjectiveType.Output,
        machineId: this.zip.parseString(s[i++], hash?.machines),
        modules: this.zip.parseIndices(s[i++], moduleSettings),
        beacons: this.zip.parseIndices(s[i++], beaconSettings),
        overclock: this.zip.parseRational(s[i++]),
        fuelId: this.zip.parseString(s[i], hash?.fuels),
      };

      if (hash) {
        obj.targetId = coalesce(
          this.zip.parseNString(
            obj.targetId,
            isRecipeObjective(obj) ? hash.recipes : hash.items,
          ),
          '',
        );
      }

      prune(obj);
      state[id] = obj;
      index++;
    }

    return state;
  }

  zipItems(
    data: ZipState,
    state: Record<string, ItemState>,
    hash: ModHash,
  ): void {
    const keys = Object.keys(state);
    if (!keys.length) return;

    data.config.bare.i = [];
    data.config.hash.i = [];
    for (const id of keys) {
      const obj = state[id];
      data.config.bare.i.push(
        this.zip.zipFields([
          id,
          this.zip.zipString(obj.beltId),
          this.zip.zipString(obj.wagonId),
          this.zip.zipRational(obj.stack),
          this.zip.zipBool(obj.excludeRockets),
        ]),
      );
      data.config.hash.i.push(
        this.zip.zipFields([
          this.zip.zipNString(id, hash.items),
          this.zip.zipNString(obj.beltId, hash.belts),
          this.zip.zipNString(obj.wagonId, hash.wagons),
          this.zip.zipRational(obj.stack),
          this.zip.zipBool(obj.excludeRockets),
        ]),
      );
    }
  }

  unzipItems(
    params: LabParams,
    hash?: ModHash,
  ): Record<string, ItemState> | undefined {
    if (params.i == null) return;

    const state: Record<string, ItemState> = {};
    for (const item of params.i) {
      const s = item.split(ZFIELDSEP);
      let i = 0;
      const id = coalesce(this.zip.parseString(s[i++], hash?.items), '');
      const obj: ItemState = {
        beltId: this.zip.parseString(s[i++], hash?.belts),
        wagonId: this.zip.parseString(s[i++], hash?.wagons),
        stack: this.zip.parseRational(s[i++]),
        excludeRockets: this.zip.parseBool(s[i]),
      };

      prune(obj);
      if (Object.keys(obj).length || this.extension.strictImports)
        state[id] = obj;
    }

    return state;
  }

  zipRecipes(
    data: ZipState,
    state: Record<string, RecipeState>,
    hash: ModHash,
  ): void {
    const keys = Object.keys(state);
    if (!keys.length) return;

    data.config.bare.r = [];
    data.config.hash.r = [];
    for (const id of keys) {
      const obj = state[id];
      const modules = this.zip.zipArray(data.recipeSettings.moduleMap[id]);
      const beacons = this.zip.zipArray(data.recipeSettings.beaconMap[id]);
      const overclock = this.zip.zipNumber(obj.overclock);
      const cost = this.zip.zipNumber(obj.cost);
      const prod = this.zip.zipNumber(obj.productivity);
      data.config.bare.r.push(
        this.zip.zipFields([
          id,
          this.zip.zipString(obj.machineId),
          modules,
          beacons,
          overclock,
          cost,
          this.zip.zipString(obj.fuelId),
          prod,
        ]),
      );
      data.config.hash.r.push(
        this.zip.zipFields([
          this.zip.zipNString(id, hash.recipes),
          this.zip.zipNString(obj.machineId, hash.machines),
          modules,
          beacons,
          overclock,
          cost,
          this.zip.zipNString(obj.fuelId, hash.fuels),
          prod,
        ]),
      );
    }
  }

  unzipRecipes(
    params: LabParams,
    moduleSettings: ModuleSettings[],
    beaconSettings: BeaconSettings[],
    hash?: ModHash,
  ): Record<string, RecipeState> | undefined {
    if (params.r == null) return;

    const state: Record<string, RecipeState> = {};
    for (const recipe of params.r) {
      const s = recipe.split(ZFIELDSEP);
      let i = 0;
      const id = coalesce(this.zip.parseString(s[i++], hash?.recipes), '');
      const obj: RecipeState = {
        machineId: this.zip.parseString(s[i++], hash?.machines),
        modules: this.zip.parseIndices(s[i++], moduleSettings),
        beacons: this.zip.parseIndices(s[i++], beaconSettings),
        overclock: this.zip.parseRational(s[i++]),
        cost: this.zip.parseRational(s[i++]),
        fuelId: this.zip.parseString(s[i++], hash?.fuels),
        productivity: this.zip.parseRational(s[i]),
      };

      prune(obj);
      if (Object.keys(obj).length || this.extension.strictImports)
        state[id] = obj;
    }

    return state;
  }

  zipMachines(
    data: ZipState,
    state: Record<string, MachineState>,
    hash: ModHash,
  ): void {
    const keys = Object.keys(state);
    if (!keys.length) return;

    data.config.bare.m = [];
    data.config.hash.m = [];
    for (const id of keys) {
      const obj = state[id];
      const modules = this.zip.zipArray(data.machineSettings.moduleMap[id]);
      const beacons = this.zip.zipArray(data.machineSettings.beaconMap[id]);
      const overclock = this.zip.zipNumber(obj.overclock);
      data.config.bare.m.push(
        this.zip.zipFields([
          id,
          modules,
          beacons,
          this.zip.zipString(obj.fuelId),
          overclock,
        ]),
      );
      data.config.hash.m.push(
        this.zip.zipFields([
          this.zip.zipNString(id, hash.machines),
          modules,
          beacons,
          this.zip.zipNString(obj.fuelId, hash.fuels),
          overclock,
        ]),
      );
    }
  }

  unzipMachines(
    params: LabParams,
    moduleSettings: ModuleSettings[],
    beaconSettings: BeaconSettings[],
    hash?: ModHash,
  ): Record<string, MachineState> | undefined {
    if (params.m == null) return;

    const state: Record<string, MachineState> = {};
    for (const machine of params.m) {
      const s = machine.split(ZFIELDSEP);
      let i = 0;
      const id = coalesce(this.zip.parseString(s[i++], hash?.machines), '');
      const obj: MachineState = {
        modules: this.zip.parseIndices(s[i++], moduleSettings),
        beacons: this.zip.parseIndices(s[i++], beaconSettings),
        fuelId: this.zip.parseString(s[i++], hash?.fuels),
        overclock: this.zip.parseRational(s[i]),
      };

      prune(obj);
      if (Object.keys(obj).length || this.extension.strictImports)
        state[id] = obj;
    }

    return state;
  }

  zipSettings(
    zState: ZipState,
    state: SettingsState,
    objectiveIds: string[],
    data: Dataset,
    hash: ModHash,
  ): void {
    const init = cloneDefaults(this.effectiveDefaults).settings;

    // Set up shorthand functions to zip state
    const set = this.zip.set(zState.config, state, init);
    const sub = set(this.zip.zipDiffSubset.bind(this.zip));
    const num = set(this.zip.zipDiffNumber.bind(this.zip));
    const bln = set(this.zip.zipDiffBool.bind(this.zip));
    const str = set(this.zip.zipDiffString.bind(this.zip));
    const rat = set(this.zip.zipDiffRational.bind(this.zip));
    const rnk = set(this.zip.zipDiffArray.bind(this.zip));
    const arr = set(this.zip.zipDiffIndices.bind(this.zip));

    // Zip state
    sub('och', (s) => s.checkedObjectiveIds, objectiveIds);
    num('omt', (s) => s.maximizeType);
    bln('orm', (s) => s.requireMachinesOutput);
    num('odr', (s) => s.displayRate);
    sub('iex', (s) => s.excludedItemIds, data.itemIds, hash.items);
    sub('ich', (s) => s.checkedItemIds, data.itemIds, hash.items);
    rnk('ibe', (s) => s.beltRankIds, hash.belts);
    rnk('icw', (s) => s.wagonRankIds, hash.wagons);
    rat('ifr', (s) => s.flowRate);
    rat('ist', (s) => s.stack);
    sub('rex', (s) => s.excludedRecipeIds, data.recipeIds, hash.recipes);
    sub('rch', (s) => s.checkedRecipeIds, data.recipeIds, hash.recipes);
    rat('rcm', (s) => s.recipeCostMultiplier);
    bln('rnp', (s) => s.netProductionOnly);
    num('mpr', (s) => s.preset);
    rnk('mmr', (s) => s.machineRankIds, hash.machines);
    rnk('mfr', (s) => s.fuelRankIds, hash.fuels);
    rnk('mer', (s) => s.moduleRankIds, hash.modules);
    arr('mbe', (s) => (s === init ? undefined : zState.beacons));
    rat('moc', (s) => s.overclock);
    rat('mbr', (s) => s.beaconReceivers);
    str('mps', (s) => s.proliferatorSprayId, hash.modules);
    rat('bmi', (s) => s.miningBonus);
    rat('bre', (s) => s.researchBonus);
    rat('brp', (s) => s.researchProductivity);
    sub(
      'tre',
      (s) => s.researchedTechnologyIds,
      data.technologyIds,
      hash.technologies,
    );
    sub(
      'loc',
      (s) => s.locationIds,
      data.locationIds,
      coalesce(hash.locations, []),
    );
    rat('cfa', (s) => s.costs.factor);
    rat('cma', (s) => s.costs.machine);
    rat('cfp', (s) => s.costs.footprint);
    rat('cun', (s) => s.costs.unproduceable);
    rat('cex', (s) => s.costs.excluded);
    rat('csu', (s) => s.costs.surplus);
    rat('cmx', (s) => s.costs.maximize);
    rat('cre', (s) => s.costs.recycling);
  }

  unzipSettings(
    modId: string | undefined,
    params: LabParams,
    beaconSettings: BeaconSettings[],
    objectiveIds: string[],
    modData: ModData,
    modHash: ModHash,
    hash?: ModHash,
  ): PartialSettingsState | undefined {
    // Set up shorthand functions to parse state
    const get = this.zip.get(params);
    const sub = get(this.zip.parseSubset.bind(this.zip));
    const num = get(this.zip.parseNumber.bind(this.zip));
    const bln = get(this.zip.parseBool.bind(this.zip));
    const str = get(this.zip.parseString.bind(this.zip));
    const rat = get(this.zip.parseRational.bind(this.zip));
    const rnk = get(this.zip.parseArray.bind(this.zip));
    const arr = get(this.zip.parseIndices.bind(this.zip));

    const obj: PartialSettingsState = {
      modId,
      checkedObjectiveIds: sub('och', objectiveIds),
      maximizeType: num('omt'),
      requireMachinesOutput: bln('orm'),
      displayRate: num('odr'),
      excludedItemIds: sub('iex', modHash.items),
      checkedItemIds: sub('ich', modHash.items),
      beltRankIds: rnk('ibe', hash?.belts),
      wagonRankIds: rnk('icw', hash?.wagons),
      flowRate: rat('ifr'),
      stack: rat('ist'),
      excludedRecipeIds: sub('rex', modHash.recipes),
      checkedRecipeIds: sub('rch', modHash.recipes),
      recipeCostMultiplier: rat('rcm'),
      netProductionOnly: bln('rnp'),
      preset: num('mpr'),
      machineRankIds: rnk('mmr', hash?.machines),
      fuelRankIds: rnk('mfr', hash?.fuels),
      moduleRankIds: rnk('mer', hash?.modules),
      beacons: arr('mbe', beaconSettings),
      overclock: rat('moc'),
      beaconReceivers: rat('mbr'),
      proliferatorSprayId: str('mps', hash?.modules),
      miningBonus: rat('bmi'),
      researchBonus: rat('bre'),
      researchProductivity: rat('brp'),
      researchedTechnologyIds: sub('tre', modHash.technologies),
      locationIds: sub('loc', coalesce(modHash.locations, [])),
    };

    const costs: Partial<CostSettings> = {
      factor: rat('cfa'),
      machine: rat('cma'),
      footprint: rat('cfp'),
      unproduceable: rat('cun'),
      excluded: rat('cex'),
      surplus: rat('csu'),
      maximize: rat('cmx'),
      recycling: rat('cre'),
    };

    const mps = (value: string, ids?: (string | null)[]): Set<string> =>
      new Set(this.zip.parseArray(value, ids));
    if (params.v10iex) obj.excludedItemIds = mps(params.v10iex, hash?.items);
    if (params.v10ich) obj.checkedItemIds = mps(params.v10ich, hash?.items);
    if (params.v10rex)
      obj.excludedRecipeIds = mps(params.v10rex, hash?.recipes);
    if (params.v10rch) obj.checkedRecipeIds = mps(params.v10rch, hash?.recipes);
    if (params.v10tre) {
      obj.researchedTechnologyIds = mps(params.v10tre, hash?.technologies);
      if (this.extension.strictImports)
        for (const id of obj.researchedTechnologyIds)
          if (
            !modData.items.some(
              (item) => item.id === id && item.technology != null,
            )
          )
            throw new WorkspaceRestoreError([
              {
                code: 'unknown-technology',
                message: `Unknown technology ID: ${id}`,
                field: 'v10tre',
                severity: 'error',
              },
            ]);
      obj.researchedTechnologyIds =
        this.migration.restoreV10ResearchedTechnologies(
          obj.researchedTechnologyIds,
          modData,
        );
    }

    prune(costs);
    if (Object.keys(costs).length) obj.costs = costs;

    prune(obj);
    if (!Object.keys(obj).length) return;

    return obj;
  }

  zipTable(zState: ZipState, state: TableState): void {
    const init = initialTableState;

    // Set up shorthand functions to zip state
    const set = this.zip.set(zState.config, state, init);
    const num = set(this.zip.zipDiffNumber.bind(this.zip));
    const bln = set(this.zip.zipDiffBool.bind(this.zip));
    const str = set(this.zip.zipDiffString.bind(this.zip));

    // Zip state
    str('tfi', (s) => s.filter);
    str('tso', (s) => s.sort);
    bln('tas', (s) => s.asc);
    num('tpg', (s) => s.page);
    num('tro', (s) => s.rows);
  }

  unzipTable(params: LabParams): Partial<TableState> | undefined {
    // Set up shorthand functions to parse state
    const get = this.zip.get(params);
    const num = get(this.zip.parseNumber.bind(this.zip));
    const bln = get(this.zip.parseBool.bind(this.zip));
    const str = get(this.zip.parseString.bind(this.zip));

    const obj: Partial<TableState> = {
      filter: str('tfi'),
      sort: str('tso'),
      asc: bln('tas'),
      page: num('tpg'),
      rows: num('tro'),
    };

    prune(obj);
    if (!Object.keys(obj).length) return;

    return obj;
  }
}
