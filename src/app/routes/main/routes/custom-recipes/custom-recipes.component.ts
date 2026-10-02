import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MenuItem, SelectItem } from 'primeng/api';
import {
  AutoCompleteCompleteEvent,
  AutoCompleteDropdownClickEvent,
} from 'primeng/autocomplete';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { Menu, MenuModule } from 'primeng/menu';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { combineLatest, first } from 'rxjs';

import { customRecipeTextColor } from '~/helpers/custom-recipe-icon';
import {
  CUSTOM_RECIPE_FORMAT,
  CUSTOM_RECIPE_LIBRARY_FORMAT,
  CUSTOM_RECIPE_VERSION,
  CustomRecipeDocument,
  customRecipeFlags,
  CustomRecipeImportResult,
  CustomRecipeJson,
  CustomRecipeLibraryDocument,
  CustomRecipeSource,
  CustomRecipeValidationIssue,
  DEFAULT_CUSTOM_RECIPE_BACKGROUND,
  DEFAULT_CUSTOM_RECIPE_ROW,
} from '~/models/custom-recipe';
import { ModuleEffect } from '~/models/data/module';
import { RecipeFlag } from '~/models/data/recipe';
import { TranslatePipe } from '~/pipes/translate.pipe';
import { ContentService } from '~/services/content.service';
import { CustomRecipeService } from '~/services/custom-recipe.service';
import { ExportService } from '~/services/export.service';
import { TranslateService } from '~/services/translate.service';
import { SettingsService } from '~/store/settings.service';

interface AmountForm {
  id: string;
  amount: string;
}

interface CustomRecipeFormData {
  iconText: string;
  iconBackground: string;
}

type RecipeTimePreset = '1' | '2' | '10' | '20' | 'custom';
type EditorMode = 'form' | 'text';

interface RecipeForm {
  id: string;
  name: string;
  category: string;
  row: number;
  time: string;
  timePreset: RecipeTimePreset;
  producers: string[];
  inputs: AmountForm[];
  outputs: AmountForm[];
  catalyst: AmountForm[];
  cost: string;
  part: string;
  usage: string;
  locations: string[];
  flags: RecipeFlag[];
  disallowedEffects: ModuleEffect[];
  customRecipe: CustomRecipeFormData;
}

@Component({
  selector: 'lab-custom-recipes',
  standalone: true,
  host: { class: 'd-block' },
  imports: [
    NgTemplateOutlet,
    FormsModule,
    AutoCompleteModule,
    ButtonModule,
    CardModule,
    CheckboxModule,
    DropdownModule,
    InputTextModule,
    InputTextareaModule,
    MenuModule,
    MultiSelectModule,
    SelectButtonModule,
    TooltipModule,
    TranslatePipe,
  ],
  templateUrl: './custom-recipes.component.html',
  styleUrls: ['./custom-recipes.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomRecipesComponent {
  router = inject(Router);
  customRecipeSvc = inject(CustomRecipeService);
  exportSvc = inject(ExportService);
  settingsSvc = inject(SettingsService);
  contentSvc = inject(ContentService);
  translateSvc = inject(TranslateService);

  modId = this.settingsSvc.modId;
  data = this.settingsSvc.dataset;
  context = this.settingsSvc.customRecipeContext;
  sources = computed(() => {
    const modId = this.modId();
    return modId == null ? [] : this.customRecipeSvc.sourcesForMod(modId);
  });
  displayedSources = computed(() =>
    [...this.sources()].sort(
      (left, right) =>
        Number(right.starred === true) - Number(left.starred === true),
    ),
  );
  selectedSourceId = signal<string | null>(null);
  selectedSource = computed(() => {
    const sourceId = this.selectedSourceId();
    return this.sources().find((source) => source.id === sourceId);
  });
  customRecipesEnabled = this.settingsSvc.customRecipesEnabled;
  customRecipeStats = computed(() => {
    const sources = this.sources();
    const total = sources.reduce(
      (count, source) => count + source.document.recipes.length,
      0,
    );
    const enabled = this.customRecipesEnabled()
      ? sources.reduce(
          (count, source) =>
            count + this.customRecipeSvc.enabledRecipeCount(source),
          0,
        )
      : 0;
    return { enabled, total };
  });
  selectedRecipeIndex = signal(0);
  importResults = signal<CustomRecipeImportResult[]>([]);
  saveResult = signal<CustomRecipeImportResult | undefined>(undefined);
  textIssues = signal<CustomRecipeValidationIssue[]>([]);
  copyResult = signal<'copied' | 'failed' | undefined>(undefined);
  copyFallbackText = signal('');

  editorMode: EditorMode = 'form';
  jsonText = '';
  showAdvanced = false;
  fileName = 'custom-recipes.json';
  recipes: RecipeForm[] = [];
  recipeMenuTarget: RecipeForm | undefined;
  recipeMenuItems: MenuItem[] = [
    {
      label: 'customRecipeEditor.removeAction',
      icon: 'fa-solid fa-trash',
      command: (): void => {
        const index = this.recipes.findIndex(
          (recipe) => recipe === this.recipeMenuTarget,
        );
        if (index !== -1) this.removeRecipe(index);
      },
    },
  ];
  itemSuggestions: SelectItem<string>[] = [];
  recipeCategoryOptions = computed<SelectItem<string>[]>(() => {
    const data = this.data();
    return data.categoryIds.map((id) => ({
      label: data.categoryEntities[id].name,
      value: id,
    }));
  });
  machineOptions = computed<SelectItem<string>[]>(() => {
    const data = this.data();
    return data.machineIds.map((id) => ({
      label: `${data.itemEntities[id].name} (${id})`,
      value: id,
    }));
  });
  itemOptions = computed<SelectItem<string>[]>(() => {
    const data = this.data();
    return data.itemIds.map((id) => ({
      label: data.itemEntities[id]?.name
        ? `${data.itemEntities[id].name} (${id})`
        : id,
      value: id,
    }));
  });
  locationOptions = computed<SelectItem<string>[]>(() => {
    const data = this.data();
    return data.locationIds.map((id) => ({
      label: data.locationEntities[id].name,
      value: id,
    }));
  });
  flagOptions: SelectItem<RecipeFlag>[] = [...customRecipeFlags].map(
    (value) => ({
      label: value,
      value,
    }),
  );
  private initializedModId: string | undefined;
  private savedFormText = '';
  private savedFileName = '';
  private libraryBaseline = '';

  constructor() {
    effect(
      () => {
        const modId = this.modId();
        const context = this.context();
        if (modId == null || context == null || this.initializedModId === modId)
          return;
        this.initializedModId = modId;
        this.customRecipeSvc.ensureBuiltInExample(context);
        const source = this.sources()[0];
        if (source) this.selectSource(source.id);
        else this.startNewDocument();
      },
      { allowSignalWrites: true },
    );
  }

  get selectedRecipe(): RecipeForm | undefined {
    return this.recipes[this.selectedRecipeIndex()];
  }

  get fileNameBase(): string {
    return this.fileName.toLowerCase().endsWith('.json')
      ? this.fileName.slice(0, -5)
      : this.fileName;
  }

  setFileNameBase(value: string): void {
    const name = value.trim();
    const base = name.toLowerCase().endsWith('.json')
      ? name.slice(0, -5)
      : name;
    this.fileName = base ? `${base}.json` : '';
    this.onFormChange();
  }

  searchItems(
    event: AutoCompleteCompleteEvent | AutoCompleteDropdownClickEvent,
  ): void {
    const query = event.query.trim().toLocaleLowerCase();
    this.itemSuggestions = this.itemOptions()
      .filter((option) => {
        const label = option.label?.toLocaleLowerCase() ?? '';
        const value = option.value.toLocaleLowerCase();
        return !query || label.includes(query) || value.includes(query);
      })
      .slice(0, 100);
  }

  setProducer(recipe: RecipeForm, producer: string | undefined): void {
    recipe.producers = producer ? [producer] : [];
    this.onFormChange();
  }

  setTimePreset(recipe: RecipeForm, preset: RecipeTimePreset): void {
    recipe.timePreset = preset;
    if (preset !== 'custom') recipe.time = preset;
    this.onFormChange();
  }

  selectSource(sourceId: string): void {
    const source = this.sources().find((entry) => entry.id === sourceId);
    if (!source) return;

    this.confirmDiscard(() => {
      this.selectedSourceId.set(source.id);
      this.fileName = source.fileName;
      this.resetDraft(source.document);
    });
  }

  startNewDocument(): void {
    this.selectedSourceId.set(null);
    this.fileName = this.nextFileName();
    this.recipes = [];
    this.itemSuggestions = this.itemOptions();
    this.selectedRecipeIndex.set(0);
    this.showAdvanced = false;
    const modId = this.modId();
    if (modId != null) this.resetDraft(this.buildDocument(modId));
  }

  newDocument(): void {
    this.confirmDiscard(() => {
      this.importResults.set([]);
      this.startNewDocument();
    });
  }

  async importFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    const context = this.context();
    if (!files?.length || context == null) return;

    const selectedFiles = Array.from(files);
    input.value = '';
    if (!(await this.canDeactivate())) return;
    this.reloadSavedForm();
    if (selectedFiles.length === 1) {
      try {
        const text = await selectedFiles[0].text();
        const value: unknown = JSON.parse(text);
        if (this.isLibrary(value)) {
          this.enterLibraryEditor();
          this.updateJsonText(text);
          return;
        }
      } catch {
        // The file importer reports parsing errors alongside per-file results.
      }
    }
    const results = await this.customRecipeSvc.importFiles(
      selectedFiles,
      context,
    );
    this.importResults.set(results);
    const imported = results.find(
      (result) => result.valid && result.source != null,
    );
    if (imported?.source) {
      this.selectedSourceId.set(imported.source.id);
      this.fileName = imported.source.fileName;
      this.resetDraft(imported.source.document);
    }
  }

  save(): void {
    if (this.editorMode === 'text') this.saveLibrary();
  }

  onFormChange(): void {
    if (this.editorMode !== 'form') return;
    this.clearFeedback();
    if (!this.hasUnsavedChanges) return;
    const context = this.context();
    if (context == null) return;

    const name = this.jsonFileName(this.fileName);
    const document = this.editorDocument();
    if (!document) return;
    const result = this.customRecipeSvc.importDocument(
      name,
      document,
      context,
      false,
      this.selectedSourceId() ?? undefined,
    );
    this.saveResult.set(result);
    if (result.valid && result.source) {
      this.selectedSourceId.set(result.source.id);
      this.fileName = result.source.fileName;
      // Keep form objects and selection stable while the user is typing.
      this.savedFileName = this.fileName;
      this.savedFormText = JSON.stringify(this.buildDocument(context.modId));
    }
  }

  download(): void {
    if (this.editorMode !== 'text') return;
    const document = this.libraryDocument();
    if (!document) return;
    this.exportSvc.saveAsJson(
      JSON.stringify(document, null, 2),
      'custom-recipe-library',
    );
  }

  downloadSource(sourceId: string): void {
    const source = this.sources().find((entry) => entry.id === sourceId);
    if (!source) return;
    this.exportSvc.saveAsJson(
      JSON.stringify(source.document, null, 2),
      this.jsonFileName(source.fileName).slice(0, -5),
    );
  }

  removeSource(sourceId: string): void {
    const modId = this.modId();
    const source = this.sources().find((entry) => entry.id === sourceId);
    if (modId == null || !source) return;
    const warningKey =
      this.selectedSourceId() === sourceId && this.hasUnsavedChanges
        ? 'customRecipeEditor.removeUnsavedFileWarning'
        : 'customRecipeEditor.removeFileWarning';
    combineLatest([
      this.translateSvc.get('customRecipeEditor.removeFile', {
        fileName: source.fileName,
      }),
      this.translateSvc.multi([
        warningKey,
        'customRecipeEditor.removeAction',
        'cancel',
      ]),
    ])
      .pipe(first())
      .subscribe(([header, [message, acceptLabel, rejectLabel]]) => {
        this.contentSvc.confirm({
          header,
          message,
          acceptLabel,
          rejectLabel,
          acceptButtonStyleClass: 'p-button-danger',
          defaultFocus: 'reject',
          accept: () => {
            if (
              this.modId() !== modId ||
              !this.sources().some((entry) => entry.id === sourceId)
            )
              return;
            this.customRecipeSvc.removeSource(modId, sourceId);
            if (this.selectedSourceId() === sourceId) this.startNewDocument();
          },
        });
      });
  }

  backToCalculator(): void {
    const modId = this.modId();
    if (modId != null)
      void this.router.navigate([modId, 'list'], {
        queryParamsHandling: 'preserve',
      });
  }

  enterLibraryEditor(): void {
    if (this.editorMode === 'text') return;
    const modId = this.modId();
    if (modId == null) return;
    this.confirmDiscard(() => {
      this.reloadSavedForm();
      const document = this.customRecipeSvc.exportLibrary(
        modId,
        this.customRecipesEnabled(),
      );
      this.libraryBaseline = JSON.stringify(document, null, 2);
      this.jsonText = this.libraryBaseline;
      this.editorMode = 'text';
      this.importResults.set([]);
      this.clearFeedback();
    });
  }

  switchEditorMode(mode: EditorMode): void {
    if (mode === this.editorMode || this.context() == null) return;
    if (mode === 'text') this.enterLibraryEditor();
    else this.closeLibraryEditor();
  }

  exitWithoutSaving(): void {
    this.editorMode = 'form';
    this.jsonText = '';
    this.libraryBaseline = '';
    this.reloadSavedForm();
  }

  closeLibraryEditor(): void {
    this.confirmDiscard(() => {
      this.exitWithoutSaving();
    });
  }

  resetLibrary(): void {
    const modId = this.modId();
    if (modId == null || this.editorMode !== 'text') return;
    this.confirmDiscard(() => {
      this.updateJsonText(
        JSON.stringify(this.customRecipeSvc.defaultLibrary(modId), null, 2),
      );
    });
  }

  clearLibrary(): void {
    const modId = this.modId();
    if (modId == null || this.editorMode !== 'text') return;
    this.confirmDiscard(() => {
      this.updateJsonText(
        JSON.stringify(
          {
            format: CUSTOM_RECIPE_LIBRARY_FORMAT,
            version: CUSTOM_RECIPE_VERSION,
            modId,
            enabled: this.customRecipesEnabled(),
            sources: [],
          },
          null,
          2,
        ),
      );
    });
  }

  updateJsonText(text: string): void {
    this.jsonText = text;
    this.clearFeedback();
  }

  formatJson(): void {
    if (this.editorMode !== 'text') return;
    try {
      this.updateJsonText(JSON.stringify(JSON.parse(this.jsonText), null, 2));
    } catch (error) {
      this.clearFeedback();
      this.textIssues.set([
        {
          path: '',
          message: `Invalid JSON: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
        },
      ]);
    }
  }

  async copyLibrary(): Promise<void> {
    await this.copyText(this.jsonText);
  }

  get hasUnsavedChanges(): boolean {
    const modId = this.modId();
    if (modId == null || !this.savedFormText) return false;
    return this.editorMode === 'text'
      ? this.jsonText !== this.libraryBaseline
      : this.fileName !== this.savedFileName ||
          JSON.stringify(this.buildDocument(modId)) !== this.savedFormText;
  }

  async loadLibraryFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      if (this.editorMode !== 'text') return;
      this.confirmDiscard(() => {
        this.updateJsonText(text);
      });
    } catch (error) {
      this.textIssues.set([
        {
          path: '',
          message:
            error instanceof Error ? error.message : 'Unable to read file',
        },
      ]);
    }
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (!this.hasUnsavedChanges) return true;
    return new Promise((resolve) => {
      this.confirmDiscard(
        () => {
          resolve(true);
        },
        () => {
          resolve(false);
        },
      );
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  private libraryDocument(): CustomRecipeLibraryDocument | undefined {
    const context = this.context();
    if (context == null) return;
    try {
      const result = this.customRecipeSvc.validateLibrary(
        JSON.parse(this.jsonText),
        context,
        this.customRecipesEnabled(),
      );
      this.textIssues.set(result.issues);
      return result.document;
    } catch (error) {
      this.textIssues.set([
        {
          path: '',
          message: `Invalid JSON: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
        },
      ]);
      return;
    }
  }

  private saveLibrary(): void {
    const document = this.libraryDocument();
    if (!document) return;
    const apply = (): void => {
      const context = this.context();
      if (context == null || context.modId !== document.modId) return;
      const result = this.customRecipeSvc.replaceLibrary(document, context);
      this.textIssues.set(result.issues);
      if (!result.valid || !result.document) return;
      this.settingsSvc.apply({ customRecipesEnabled: result.document.enabled });
      this.jsonText = JSON.stringify(result.document, null, 2);
      this.libraryBaseline = this.jsonText;
      this.reloadSavedForm();
      this.saveResult.set({ valid: true, issues: [] });
    };
    const names = new Set(document.sources.map((source) => source.fileName));
    const ids = new Set(
      document.sources.flatMap((source) =>
        source.recipes.map((recipe) => recipe.id),
      ),
    );
    const removesData = this.sources().some(
      (source) =>
        !names.has(source.fileName) ||
        source.document.recipes.some((recipe) => !ids.has(recipe.id)),
    );
    if (!removesData) {
      apply();
      return;
    }
    this.translateSvc
      .multi([
        'customRecipeEditor.replaceTitle',
        'customRecipeEditor.replaceWarning',
        'yes',
        'cancel',
      ])
      .pipe(first())
      .subscribe(([header, message, acceptLabel, rejectLabel]) => {
        this.contentSvc.confirm({
          header,
          message,
          acceptLabel,
          rejectLabel,
          accept: apply,
        });
      });
  }

  private reloadSavedForm(): void {
    const source = this.selectedSource() ?? this.sources()[0];
    if (source) {
      this.selectedSourceId.set(source.id);
      this.fileName = source.fileName;
      this.resetDraft(source.document);
    } else this.startNewDocument();
  }

  private isLibrary(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value != null &&
      'format' in value &&
      value.format === CUSTOM_RECIPE_LIBRARY_FORMAT
    );
  }

  private editorDocument(): CustomRecipeDocument | undefined {
    const context = this.context();
    if (context == null) return;
    if (!this.fileName.trim()) {
      this.textIssues.set([
        { path: 'fileName', message: 'File name cannot be empty.' },
      ]);
      return;
    }
    const fileName = this.jsonFileName(this.fileName);
    if (
      this.sources().some(
        (source) =>
          source.id !== this.selectedSourceId() && source.fileName === fileName,
      )
    ) {
      this.textIssues.set([
        { path: 'fileName', message: 'A file with this name already exists.' },
      ]);
      return;
    }
    const value = this.buildDocument(context.modId);
    const validation = this.customRecipeSvc.validateDocument(
      fileName,
      value,
      context,
      false,
      this.selectedSourceId() ?? undefined,
    );
    this.textIssues.set(validation.issues);
    if (validation.valid) return value;
    return;
  }

  private resetDraft(document: CustomRecipeDocument): void {
    this.loadDocument(document);
    this.savedFileName = this.fileName;
    this.savedFormText = JSON.stringify(this.buildDocument(document.modId));
    this.clearFeedback();
  }

  private clearFeedback(): void {
    this.saveResult.set(undefined);
    this.textIssues.set([]);
    this.copyResult.set(undefined);
    this.copyFallbackText.set('');
  }

  private confirmDiscard(action: () => void, reject?: () => void): void {
    if (!this.hasUnsavedChanges) {
      action();
      return;
    }
    this.translateSvc
      .multi([
        'customRecipeEditor.unsavedTitle',
        'customRecipeEditor.unsavedWarning',
        'customRecipeEditor.discardChanges',
        'customRecipeEditor.continueEditing',
      ])
      .pipe(first())
      .subscribe(([header, message, acceptLabel, rejectLabel]) => {
        this.contentSvc.confirm({
          header,
          message,
          acceptLabel,
          rejectLabel,
          accept: action,
          reject,
          closeOnEscape: false,
          dismissableMask: false,
        });
      });
  }

  private async copyText(text: string): Promise<void> {
    this.copyResult.set(undefined);
    this.copyFallbackText.set('');
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.copyResult.set('copied');
        return;
      }
    } catch {
      // HTTP origins and denied clipboard permissions use the synchronous fallback.
    }
    const activeElement = window.document.activeElement;
    const textarea = window.document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    window.document.body.appendChild(textarea);
    let copied = false;
    try {
      textarea.focus();
      textarea.select();
      copied = window.document.execCommand('copy');
    } catch {
      copied = false;
    } finally {
      textarea.remove();
      if (activeElement instanceof HTMLElement) activeElement.focus();
    }
    this.copyResult.set(copied ? 'copied' : 'failed');
    if (!copied) this.copyFallbackText.set(text);
  }

  setCustomRecipesEnabled(enabled: boolean): void {
    this.settingsSvc.apply({ customRecipesEnabled: enabled });
  }

  sourceEnabled(source: CustomRecipeSource): boolean {
    return this.customRecipeSvc.sourceEnabled(source);
  }

  enabledRecipeCount(source: CustomRecipeSource): number {
    return this.customRecipeSvc.enabledRecipeCount(source);
  }

  selectedSourceEnabled(): boolean {
    const source = this.selectedSource();
    return source == null || this.sourceEnabled(source);
  }

  setSourceEnabled(sourceId: string, enabled: boolean): void {
    const modId = this.modId();
    if (modId != null)
      this.customRecipeSvc.setSourceEnabled(modId, sourceId, enabled);
  }

  setSourceStarred(sourceId: string, starred: boolean): void {
    const modId = this.modId();
    if (modId != null)
      this.customRecipeSvc.setSourceStarred(modId, sourceId, starred);
  }

  recipeEnabled(recipeId: string): boolean {
    if (!this.customRecipesEnabled()) return false;
    const source = this.selectedSource();
    return (
      source == null || this.customRecipeSvc.recipeEnabled(source, recipeId)
    );
  }

  setRecipeEnabled(recipeId: string, enabled: boolean): void {
    const modId = this.modId();
    const sourceId = this.selectedSourceId();
    if (modId != null && sourceId != null)
      this.customRecipeSvc.setRecipeEnabled(modId, sourceId, recipeId, enabled);
  }

  addRecipe(): void {
    this.recipes.push(this.createRecipe(this.recipes.length));
    this.selectedRecipeIndex.set(this.recipes.length - 1);
    this.onFormChange();
  }

  openRecipeMenu(event: Event, recipe: RecipeForm, menu: Menu): void {
    if (menu.visible && this.recipeMenuTarget === recipe) {
      menu.toggle(event);
      return;
    }
    const wasVisible = menu.visible;
    this.recipeMenuTarget = recipe;
    menu.show(event);
    if (wasVisible) menu.alignOverlay();
  }

  removeRecipe(index: number): void {
    const selectedIndex = this.selectedRecipeIndex();
    this.recipes.splice(index, 1);
    this.selectedRecipeIndex.set(
      Math.max(
        0,
        Math.min(
          index < selectedIndex ? selectedIndex - 1 : selectedIndex,
          this.recipes.length - 1,
        ),
      ),
    );
    this.onFormChange();
  }

  addAmount(rows: AmountForm[]): void {
    rows.push({ id: '', amount: '1' });
    this.onFormChange();
  }

  removeAmount(rows: AmountForm[], index: number): void {
    rows.splice(index, 1);
    this.onFormChange();
  }

  colorValue(value: string): string {
    return this.isColor(value) ? value : DEFAULT_CUSTOM_RECIPE_BACKGROUND;
  }

  textColor(value: string): string {
    return this.isColor(value) ? customRecipeTextColor(value) : '#fff';
  }

  setColor(target: RecipeForm, event: Event): void {
    target.customRecipe.iconBackground = (
      event.target as HTMLInputElement
    ).value;
    this.onFormChange();
  }

  private loadDocument(document: CustomRecipeDocument): void {
    this.recipes = document.recipes.map((recipe) => this.toRecipeForm(recipe));
    this.itemSuggestions = this.itemOptions();
    this.selectedRecipeIndex.set(0);
  }

  private toRecipeForm(recipe: CustomRecipeJson): RecipeForm {
    return {
      id: recipe.id,
      name: recipe.name,
      category: recipe.category,
      row: recipe.row,
      time: this.valueString(recipe.time),
      timePreset: this.timePresetFor(recipe.time),
      producers: [...recipe.producers],
      inputs: this.toAmountForms(recipe.in),
      outputs: this.toAmountForms(recipe.out),
      catalyst: this.toAmountForms(recipe.catalyst),
      cost: this.valueString(recipe.cost),
      part: recipe.part ?? '',
      usage: this.valueString(recipe.usage),
      locations: [...(recipe.locations ?? [])],
      flags: [...(recipe.flags ?? [])],
      disallowedEffects: [...(recipe.disallowedEffects ?? [])],
      customRecipe: {
        iconText: recipe.customRecipe.iconText,
        iconBackground:
          recipe.customRecipe.iconBackground ??
          DEFAULT_CUSTOM_RECIPE_BACKGROUND,
      },
    };
  }

  private toAmountForms(
    value: Record<string, string | number> | undefined,
  ): AmountForm[] {
    const rows = Object.entries(value ?? {}).map(([id, amount]) => ({
      id,
      amount: this.valueString(amount),
    }));
    return rows.length ? rows : [{ id: '', amount: '1' }];
  }

  private createRecipe(index: number): RecipeForm {
    const id = `custom-recipe-${String(index + 1)}`;
    return {
      id,
      name: '',
      category: this.recipeCategoryOptions()[0]?.value ?? '',
      row: DEFAULT_CUSTOM_RECIPE_ROW,
      time: '2',
      timePreset: '2',
      producers: this.machineOptions()[0]?.value
        ? [this.machineOptions()[0].value]
        : [],
      inputs: [{ id: '', amount: '1' }],
      outputs: [{ id: '', amount: '1' }],
      catalyst: [{ id: '', amount: '1' }],
      cost: '',
      part: '',
      usage: '',
      locations: [],
      flags: [],
      disallowedEffects: [],
      customRecipe: {
        iconText: this.firstCharacter(id),
        iconBackground: DEFAULT_CUSTOM_RECIPE_BACKGROUND,
      },
    };
  }

  private buildDocument(modId: string): CustomRecipeDocument {
    return {
      format: CUSTOM_RECIPE_FORMAT,
      version: CUSTOM_RECIPE_VERSION,
      modId,
      recipes: this.recipes.map((recipe) => this.toRecipeJson(recipe)),
    };
  }

  private toRecipeJson(recipe: RecipeForm): CustomRecipeJson {
    const result: CustomRecipeJson = {
      id: recipe.id.trim(),
      name: recipe.name.trim(),
      category: recipe.category,
      row: Number.isFinite(recipe.row) ? recipe.row : DEFAULT_CUSTOM_RECIPE_ROW,
      time: recipe.time.trim(),
      producers: [...recipe.producers],
      in: this.toEntityMap(recipe.inputs),
      out: this.toEntityMap(recipe.outputs),
      customRecipe: {
        iconText: recipe.customRecipe.iconText.trim(),
        iconBackground: recipe.customRecipe.iconBackground.trim(),
      },
    };
    const catalyst = this.toEntityMap(recipe.catalyst);
    if (Object.keys(catalyst).length) result.catalyst = catalyst;
    if (recipe.cost.trim()) result.cost = recipe.cost.trim();
    if (recipe.part.trim()) result.part = recipe.part.trim();
    if (recipe.usage.trim()) result.usage = recipe.usage.trim();
    if (recipe.locations.length) result.locations = [...recipe.locations];
    if (recipe.flags.length) result.flags = [...recipe.flags];
    if (recipe.disallowedEffects.length)
      result.disallowedEffects = [...recipe.disallowedEffects];
    return result;
  }

  private toEntityMap(rows: AmountForm[]): Record<string, string> {
    return rows.reduce((result: Record<string, string>, row) => {
      const id = row.id.trim();
      if (id) result[id] = row.amount.trim();
      return result;
    }, {});
  }

  private nextFileName(): string {
    const names = new Set(this.sources().map((source) => source.fileName));
    let name = 'custom-recipes.json';
    let index = 2;
    while (names.has(name)) name = `custom-recipes-${String(index++)}.json`;
    return name;
  }

  private jsonFileName(value: string): string {
    const name = value.trim() || 'custom-recipes.json';
    return name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
  }

  private valueString(value: string | number | undefined): string {
    return value == null ? '' : String(value);
  }

  private timePresetFor(value: string | number): RecipeTimePreset {
    const time = Number(value);
    return time === 1 || time === 2 || time === 10 || time === 20
      ? (String(time) as '1' | '2' | '10' | '20')
      : 'custom';
  }

  private firstCharacter(value: string): string {
    return Array.from(value)[0] ?? '?';
  }

  private isColor(value: string): boolean {
    return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value.trim());
  }
}
