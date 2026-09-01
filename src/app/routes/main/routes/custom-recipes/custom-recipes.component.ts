import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { saveAs } from 'file-saver';
import { SelectItem } from 'primeng/api';
import {
  AutoCompleteCompleteEvent,
  AutoCompleteDropdownClickEvent,
} from 'primeng/autocomplete';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';

import { customRecipeTextColor } from '~/helpers/custom-recipe-icon';
import {
  CUSTOM_ITEM_CATEGORY_ID,
  CUSTOM_ITEM_CATEGORY_NAME,
  CUSTOM_RECIPE_FORMAT,
  CUSTOM_RECIPE_VERSION,
  CustomItemJson,
  CustomItemType,
  CustomRecipeDocument,
  customRecipeEffects,
  customRecipeFlags,
  CustomRecipeImportResult,
  CustomRecipeJson,
  CustomRecipeSource,
  DEFAULT_CUSTOM_RECIPE_BACKGROUND,
  DEFAULT_CUSTOM_RECIPE_ROW,
} from '~/models/custom-recipe';
import { ModuleEffect } from '~/models/data/module';
import { RecipeFlag } from '~/models/data/recipe';
import { TranslatePipe } from '~/pipes/translate.pipe';
import { CustomRecipeService } from '~/services/custom-recipe.service';
import { TranslateService } from '~/services/translate.service';
import { SettingsService } from '~/store/settings.service';

interface AmountForm {
  id: string;
  amount: string;
}

interface ItemForm {
  id: string;
  name: string;
  category: string;
  row: number;
  type: CustomItemType;
  iconText: string;
  iconBackground: string;
}

type RecipeTimePreset = '1' | '2' | '10' | '20' | 'custom';

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
  iconText: string;
  iconBackground: string;
}

type EditorMode = 'items' | 'recipes';

@Component({
  selector: 'lab-custom-recipes',
  standalone: true,
  host: { class: 'd-block' },
  imports: [
    FormsModule,
    AutoCompleteModule,
    ButtonModule,
    CheckboxModule,
    DropdownModule,
    InputTextModule,
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
  settingsSvc = inject(SettingsService);
  translateSvc = inject(TranslateService);

  modId = this.settingsSvc.modId;
  data = this.settingsSvc.dataset;
  context = this.settingsSvc.customRecipeContext;
  sources = computed(() => {
    const modId = this.modId();
    return modId == null ? [] : this.customRecipeSvc.sourcesForMod(modId);
  });
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
  selectedItemIndex = signal(0);
  selectedRecipeIndex = signal(0);
  importResults = signal<CustomRecipeImportResult[]>([]);
  saveResult = signal<CustomRecipeImportResult | undefined>(undefined);

  editorMode: EditorMode = 'recipes';
  showAdvanced = false;
  fileName = 'custom-recipes.json';
  items: ItemForm[] = [];
  recipes: RecipeForm[] = [];
  itemSuggestions: SelectItem<string>[] = [];
  readonly timePresets: RecipeTimePreset[] = ['1', '2', '10', '20', 'custom'];
  itemTypeLabels = toSignal(
    this.translateSvc.multi([
      'customRecipeEditor.solid',
      'customRecipeEditor.liquid',
      'customRecipeEditor.gas',
    ]),
    { initialValue: ['固体', '液体', '气体'] },
  );
  itemTypeOptions = computed<SelectItem<CustomItemType>[]>(() => {
    const labels = this.itemTypeLabels();
    return [
      { label: labels[0], value: 'solid' },
      { label: labels[1], value: 'liquid' },
      { label: labels[2], value: 'gas' },
    ];
  });

  itemCategoryOptions = computed<SelectItem<string>[]>(() => {
    const data = this.data();
    const options = data.categoryIds.map((id) => ({
      label: data.categoryEntities[id].name,
      value: id,
    }));
    if (!options.some((option) => option.value === CUSTOM_ITEM_CATEGORY_ID))
      options.push({
        label: CUSTOM_ITEM_CATEGORY_NAME,
        value: CUSTOM_ITEM_CATEGORY_ID,
      });
    return options;
  });
  recipeCategoryOptions = computed<SelectItem<string>[]>(() => {
    const data = this.data();
    return data.categoryIds
      .filter((id) => id !== CUSTOM_ITEM_CATEGORY_ID)
      .map((id) => ({ label: data.categoryEntities[id].name, value: id }));
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
  effectOptions: SelectItem<ModuleEffect>[] = [...customRecipeEffects].map(
    (value) => ({
      label: value,
      value,
    }),
  );

  private initializedModId: string | undefined;

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

  get selectedItem(): ItemForm | undefined {
    return this.items[this.selectedItemIndex()];
  }

  get selectedRecipe(): RecipeForm | undefined {
    return this.recipes[this.selectedRecipeIndex()];
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
  }

  setTimePreset(recipe: RecipeForm, preset: RecipeTimePreset): void {
    recipe.timePreset = preset;
    if (preset !== 'custom') recipe.time = preset;
  }

  itemIdSuffix(item: ItemForm): string {
    return item.id.startsWith('v_') ? item.id.slice(2) : item.id;
  }

  setItemIdSuffix(item: ItemForm, event: Event): void {
    item.id = `v_${(event.target as HTMLInputElement).value}`;
  }

  selectSource(sourceId: string): void {
    const source = this.sources().find((entry) => entry.id === sourceId);
    if (!source) return;

    this.selectedSourceId.set(source.id);
    this.fileName = source.fileName;
    this.saveResult.set(undefined);
    this.loadDocument(source.document);
  }

  startNewDocument(): void {
    this.selectedSourceId.set(null);
    this.fileName = this.nextFileName();
    this.items = [];
    this.recipes = [];
    this.itemSuggestions = this.itemOptions();
    this.selectedItemIndex.set(0);
    this.selectedRecipeIndex.set(0);
    this.editorMode = 'recipes';
    this.showAdvanced = false;
    this.saveResult.set(undefined);
  }

  newDocument(): void {
    this.importResults.set([]);
    this.startNewDocument();
  }

  importFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    const context = this.context();
    if (!files?.length || context == null) return;

    void this.customRecipeSvc
      .importFiles(Array.from(files), context)
      .then((results) => {
        this.importResults.set(results);
        const imported = results.find(
          (result) => result.valid && result.source != null,
        );
        if (imported?.source) this.selectSource(imported.source.id);
        input.value = '';
      });
  }

  save(): void {
    const context = this.context();
    if (context == null) return;

    const name = this.jsonFileName(this.fileName);
    const result = this.customRecipeSvc.importDocument(
      name,
      this.buildDocument(context.modId),
      context,
    );
    this.saveResult.set(result);
    if (result.valid && result.source) {
      this.selectedSourceId.set(result.source.id);
      this.fileName = result.source.fileName;
      this.loadDocument(result.source.document);
    }
  }

  download(): void {
    const context = this.context();
    if (context == null) return;

    const blob = new Blob(
      [JSON.stringify(this.buildDocument(context.modId), null, 2)],
      { type: 'application/json' },
    );
    saveAs(blob, this.jsonFileName(this.fileName));
  }

  removeSelectedSource(): void {
    const modId = this.modId();
    const sourceId = this.selectedSourceId();
    if (modId == null || sourceId == null) return;
    this.customRecipeSvc.removeSource(modId, sourceId);
    this.startNewDocument();
  }

  backToCalculator(): void {
    const modId = this.modId();
    if (modId != null)
      void this.router.navigate([modId, 'list'], {
        queryParamsHandling: 'preserve',
      });
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

  addItem(): void {
    this.items.push(this.createItem(this.items.length));
    this.editorMode = 'items';
    this.selectedItemIndex.set(this.items.length - 1);
  }

  removeItem(index: number): void {
    this.items.splice(index, 1);
    this.selectedItemIndex.set(
      Math.max(0, Math.min(index, this.items.length - 1)),
    );
  }

  addRecipe(): void {
    this.recipes.push(this.createRecipe(this.recipes.length));
    this.editorMode = 'recipes';
    this.selectedRecipeIndex.set(this.recipes.length - 1);
  }

  removeRecipe(index: number): void {
    this.recipes.splice(index, 1);
    this.selectedRecipeIndex.set(
      Math.max(0, Math.min(index, this.recipes.length - 1)),
    );
  }

  addAmount(rows: AmountForm[]): void {
    rows.push({ id: '', amount: '1' });
  }

  removeAmount(rows: AmountForm[], index: number): void {
    rows.splice(index, 1);
  }

  colorValue(value: string): string {
    return this.isColor(value) ? value : DEFAULT_CUSTOM_RECIPE_BACKGROUND;
  }

  textColor(value: string): string {
    return this.isColor(value) ? customRecipeTextColor(value) : '#fff';
  }

  setColor(target: ItemForm | RecipeForm, event: Event): void {
    target.iconBackground = (event.target as HTMLInputElement).value;
  }

  private loadDocument(document: CustomRecipeDocument): void {
    this.items = (document.items ?? []).map((item) => this.toItemForm(item));
    this.recipes = document.recipes.map((recipe) => this.toRecipeForm(recipe));
    this.itemSuggestions = this.itemOptions();
    this.selectedItemIndex.set(0);
    this.selectedRecipeIndex.set(0);
  }

  private toItemForm(item: CustomItemJson): ItemForm {
    return {
      id: item.id,
      name: item.name,
      category: item.category ?? CUSTOM_ITEM_CATEGORY_ID,
      row: item.row ?? DEFAULT_CUSTOM_RECIPE_ROW,
      type: item.type ?? this.inferItemType(item),
      iconText: item.iconText ?? this.firstCharacter(item.id),
      iconBackground: item.iconBackground ?? DEFAULT_CUSTOM_RECIPE_BACKGROUND,
    };
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
      iconText: recipe.iconText,
      iconBackground: recipe.iconBackground ?? DEFAULT_CUSTOM_RECIPE_BACKGROUND,
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

  private createItem(index: number): ItemForm {
    const id = `v_custom_item_${String(index + 1)}`;
    return {
      id,
      name: '',
      category: CUSTOM_ITEM_CATEGORY_ID,
      row: DEFAULT_CUSTOM_RECIPE_ROW,
      type: 'solid',
      iconText: this.firstCharacter(id),
      iconBackground: DEFAULT_CUSTOM_RECIPE_BACKGROUND,
    };
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
      outputs: [{ id: this.items[0]?.id ?? '', amount: '1' }],
      catalyst: [{ id: '', amount: '1' }],
      cost: '',
      part: '',
      usage: '',
      locations: [],
      flags: [],
      disallowedEffects: [],
      iconText: this.firstCharacter(id),
      iconBackground: DEFAULT_CUSTOM_RECIPE_BACKGROUND,
    };
  }

  private buildDocument(modId: string): CustomRecipeDocument {
    return {
      format: CUSTOM_RECIPE_FORMAT,
      version: CUSTOM_RECIPE_VERSION,
      modId,
      items: this.items.map((item) => this.toItemJson(item)),
      recipes: this.recipes.map((recipe) => this.toRecipeJson(recipe)),
    };
  }

  private toItemJson(item: ItemForm): CustomItemJson {
    const result: CustomItemJson = {
      id: item.id.trim(),
      name: item.name.trim(),
      row: Number.isFinite(item.row) ? item.row : DEFAULT_CUSTOM_RECIPE_ROW,
      iconText: item.iconText.trim() || '?',
      iconBackground: this.colorValue(item.iconBackground),
    };
    if (item.category) result.category = item.category;
    if (result.id.startsWith('v_')) result.type = item.type;
    return result;
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
      iconText: recipe.iconText.trim() || '?',
      iconBackground: this.colorValue(recipe.iconBackground),
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

  private inferItemType(item: CustomItemJson): CustomItemType {
    if (item.stack != null) return 'solid';
    const id = item.id.toLocaleLowerCase();
    if (
      id.startsWith('gas_') ||
      id.endsWith('_gas') ||
      /气体|气态|气$/u.test(item.name)
    )
      return 'gas';
    return 'liquid';
  }

  private isColor(value: string): boolean {
    return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value.trim());
  }
}
