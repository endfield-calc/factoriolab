import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  InputSignal,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { DropdownModule } from 'primeng/dropdown';
import { FieldsetModule } from 'primeng/fieldset';
import { MessagesModule } from 'primeng/messages';
import { OrderListModule } from 'primeng/orderlist';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { TooltipModule } from 'primeng/tooltip';

import { InputNumberComponent } from '~/components/input-number/input-number.component';
import { PickerComponent } from '~/components/picker/picker.component';
import { NoDragDirective } from '~/directives/no-drag.directive';
import { ObjectiveType } from '~/models/enum/objective-type';
import { ObjectiveUnit } from '~/models/enum/objective-unit';
import { ObjectiveBase } from '~/models/objective';
import { fromNumber, Rational, rational } from '~/models/rational';
import { IconSmClassPipe } from '~/pipes/icon-class.pipe';
import { TranslatePipe } from '~/pipes/translate.pipe';
import { ContentService } from '~/services/content.service';
import { RouterService } from '~/services/router.service';
import { ItemsService } from '~/store/items.service';
import { ObjectivesService } from '~/store/objectives.service';
import { RecipesService } from '~/store/recipes.service';
import { SettingsService } from '~/store/settings.service';

const rational20 = fromNumber(20);
const rational60 = fromNumber(60);
const rational1d60 = rational60.reciprocal();
const waterNodeRecipeIds = ['sewage-treat', 'sewage-treat-export'];
const ignoredCollectionRecipeIds = ['liquid_water', 'liquid_acid'];
const unlimitedSupplyItemIds = ['liquid_water', 'liquid_acid'];

type ResourceGroup = 'solid' | 'liquid' | 'gas';

interface ResourceSupplyItem {
  id: string;
  recipe: string;
  group: ResourceGroup;
}

interface CustomSupplyInput {
  id: string;
  num: Rational;
}

@Component({
  selector: 'lab-resource-input',
  standalone: true,
  imports: [
    AccordionModule,
    FormsModule,
    ButtonModule,
    CardModule,
    CheckboxModule,
    DropdownModule,
    FieldsetModule,
    MessagesModule,
    OrderListModule,
    ToggleButtonModule,
    TooltipModule,
    IconSmClassPipe,
    InputNumberComponent,
    PickerComponent,
    TranslatePipe,
    NoDragDirective,
  ],
  templateUrl: './resource-input.component.html',
  styleUrl: './resource-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResourceInputComponent {
  contentSvc = inject(ContentService);
  itemsSvc = inject(ItemsService);
  recipesSvc = inject(RecipesService);
  settingsSvc = inject(SettingsService);
  objectivesSvc = inject(ObjectivesService);
  routerSvc = inject(RouterService);

  settings = this.settingsSvc.settings;
  itemsState = this.itemsSvc.settings;
  data = this.recipesSvc.adjustedDataset;
  objectives = computed(() => [...this.objectivesSvc.objectives()]);

  readonly limitItems: InputSignal<ResourceSupplyItem[]> = input<
    ResourceSupplyItem[]
  >([
    { id: 'originium_ore', recipe: 'originium_ore', group: 'solid' },
    { id: 'quartz_sand', recipe: 'quartz_sand', group: 'solid' },
    { id: 'iron_ore', recipe: 'iron_ore', group: 'solid' },
    {
      id: 'copper_ore',
      recipe: 'copper_ore-liquid_water',
      group: 'solid',
    },
    { id: 'gas_xiranite', recipe: 'gas_xiranite', group: 'gas' },
    { id: 'gas_inert', recipe: 'gas_inert', group: 'gas' },
  ]);
  limitItemsNum = signal<Record<string, Rational>>({});
  ignoreCollectionDevices = signal(false);
  customInputs = signal<CustomSupplyInput[]>([]);
  resourceGroups = computed(() => {
    const labels: Record<ResourceGroup, string> = {
      solid: '固体',
      liquid: '液体',
      gas: '气体',
    };
    const groups: ResourceGroup[] = ['solid', 'liquid', 'gas'];
    return groups
      .map((id) => ({
        id,
        label: labels[id],
        items: this.limitItems().filter((it) => it.group === id),
      }))
      .filter((group) => group.items.length > 0);
  });
  customInputAvailableIds = computed(() => {
    const selectedIds = new Set(this.customInputs().map((it) => it.id));
    return this.data().itemIds.filter((id) => !selectedIds.has(id));
  });

  readonly limitMachines: InputSignal<string[]> = input(['xiranite_oven_1']);
  enableLimitMachines = signal(false);
  limitMachinesNum = signal<Record<string, Rational>>({});

  readonly allowTransferSource = ['tundra'];
  enableDomainTransfer = signal(false);
  disableWaterNode = signal(false);
  transferSourceOptions = computed(() => {
    const setLoc = this.settings().locationIds;
    if (setLoc.size === 1) {
      return this.allowTransferSource.filter(
        (it) => !this.settings().locationIds.has(it),
      );
    } else {
      return this.allowTransferSource;
    }
  });
  transferSource = signal<string>('');

  ready = signal(false);

  oneKeyConfig: {
    id: string;
    icon: string;
    name: string;
    clearLoc?: boolean;
    location?: string;
    limitItems?: { id: string; num: Rational }[];
    limitMachines?: { id: string; num: Rational }[];
    transferSource?: string;
    disableWaterNode?: boolean;
    ignoreCollectionDevices?: boolean;
    customInputs?: CustomSupplyInput[];
  }[] = [
    {
      id: 'tundra',
      icon: 'tundra',
      name: '四号谷地',
      location: 'tundra',
      limitItems: [
        { id: 'originium_ore', num: fromNumber(560) },
        { id: 'quartz_sand', num: fromNumber(240) },
        { id: 'iron_ore', num: fromNumber(1080) },
        { id: 'copper_ore', num: rational.zero },
        { id: 'gas_xiranite', num: rational.zero },
        { id: 'gas_inert', num: rational.zero },
      ],
    },
    {
      id: 'jinlong1.4',
      icon: 'jinlong',
      name: '武陵 1.4版本',
      location: 'jinlong',
      limitItems: [
        { id: 'originium_ore', num: fromNumber(540) },
        { id: 'quartz_sand', num: rational.zero },
        { id: 'iron_ore', num: fromNumber(120) },
        { id: 'copper_ore', num: fromNumber(420) },
        { id: 'gas_xiranite', num: fromNumber(100) },
        { id: 'gas_inert', num: fromNumber(460) },
      ],
      limitMachines: [{ id: 'xiranite_oven_1', num: fromNumber(12) }],
      transferSource: 'tundra',
      disableWaterNode: false,
    },
    {
      id: 'clear',
      icon: 'pipe',
      name: '清空设置',
      clearLoc: true,
      disableWaterNode: false,
      customInputs: [],
    },
  ];

  constructor() {
    effect(
      () => {
        const limitItems = this.limitItems();

        const itemsNum = untracked(() => this.limitItemsNum());
        if (limitItems) {
          limitItems.forEach((it) => {
            if (!itemsNum[it.id]) {
              itemsNum[it.id] = rational.zero;
            }
          });
        }
        this.limitItemsNum.set({ ...itemsNum });

        const limitMachines = this.limitMachines();
        const machinesNum = untracked(() => this.limitMachinesNum());
        if (limitMachines) {
          limitMachines.forEach((it) => {
            if (!machinesNum[it]) {
              machinesNum[it] = rational.zero;
            }
          });
        }
        this.limitMachinesNum.set({ ...machinesNum });
      },
      { allowSignalWrites: true },
    );
    // 收到变化后300ms设为初始化完毕
    const removeLoadEffect = effect(() => {
      if (this.objectives().length > 0) {
        removeLoadEffect.destroy();
        untracked(() => {
          const objectives = this.objectives();
          const displayRate = this.settingsSvc.displayRateInfo().value;
          const rateFactor = rational60.mul(displayRate.reciprocal());
          const cfg: (typeof this.oneKeyConfig)[number] = {
            id: 'load',
            icon: 'tundra',
            name: '加载',
            disableWaterNode: waterNodeRecipeIds.every((id) =>
              this.settings().excludedRecipeIds.has(id),
            ),
          };
          const limitRecipe2ItemId = Object.fromEntries(
            this.limitItems().map((it) => [it.recipe, it.id]),
          );
          const limitItemIds = new Set(this.limitItems().map((it) => it.id));
          for (const obj of objectives) {
            if (obj.type < ObjectiveType.HideSep) {
              continue;
            }
            switch (obj.type) {
              case ObjectiveType.ItemLimit: {
                const targetItemId = limitRecipe2ItemId[obj.targetId];
                if (!targetItemId) break;
                if (!cfg.limitItems) cfg.limitItems = [];
                const exist = cfg.limitItems.find(
                  (it) => it.id === targetItemId,
                );
                if (exist) {
                  exist.num = obj.value.mul(rational20);
                } else {
                  cfg.limitItems.push({
                    id: targetItemId,
                    num: obj.value.mul(rational20),
                  });
                }
                break;
              }
              case ObjectiveType.ItemSupply: {
                // Type 12 used to represent a mining recipe output objective.
                // Keep old shared links in local-collection mode.
                if (obj.unit === ObjectiveUnit.Machines) {
                  const targetItemId = limitRecipe2ItemId[obj.targetId];
                  if (!targetItemId) break;
                  if (!cfg.limitItems) cfg.limitItems = [];
                  const exist = cfg.limitItems.find(
                    (it) => it.id === targetItemId,
                  );
                  if (exist) {
                    exist.num = obj.value.mul(rational20);
                  } else {
                    cfg.limitItems.push({
                      id: targetItemId,
                      num: obj.value.mul(rational20),
                    });
                  }
                } else if (limitItemIds.has(obj.targetId)) {
                  cfg.ignoreCollectionDevices = true;
                  if (!cfg.limitItems) cfg.limitItems = [];
                  const exist = cfg.limitItems.find(
                    (it) => it.id === obj.targetId,
                  );
                  const num = obj.value.mul(rateFactor);
                  if (exist) exist.num = num;
                  else cfg.limitItems.push({ id: obj.targetId, num });
                } else {
                  if (!cfg.customInputs) cfg.customInputs = [];
                  cfg.customInputs.push({
                    id: obj.targetId,
                    num: obj.value.mul(rateFactor),
                  });
                }
                break;
              }
              case ObjectiveType.ItemSupplyUnlimited:
                cfg.ignoreCollectionDevices = true;
                break;
              case ObjectiveType.CustomItemSupply:
                if (!cfg.customInputs) cfg.customInputs = [];
                cfg.customInputs.push({
                  id: obj.targetId,
                  num: obj.value.mul(rateFactor),
                });
                break;
              case ObjectiveType.MachineLimit: {
                if (!cfg.limitMachines) cfg.limitMachines = [];
                const exist = cfg.limitMachines.find(
                  (it) => it.id === obj.targetId,
                );
                if (exist) {
                  exist.num = obj.value;
                } else {
                  cfg.limitMachines.push({ id: obj.targetId, num: obj.value });
                }
                break;
              }
              case ObjectiveType.DomainTransfer: {
                cfg.transferSource = obj.targetId.replace('domain_key_', '');
                break;
              }
            }
          }
          this.applyOneKeyConfig(cfg);
          setTimeout(() => {
            this.ready.set(true);
          }, 300);
        });
      }
    });
    // 700ms后无条件设为初始化完毕
    const effectRef = effect(() => {
      if (this.routerSvc.ready()) {
        effectRef.destroy();
        untracked(() => {
          this.disableWaterNode.set(
            waterNodeRecipeIds.every((id) =>
              this.settings().excludedRecipeIds.has(id),
            ),
          );
        });
        setTimeout(() => {
          this.ready.set(true);
        }, 700);
      }
    });
    effect(() => {
      if (!this.ready()) return;
      const displayRate = this.settingsSvc.displayRateInfo().value;
      const rateFactor = displayRate.mul(rational1d60);
      {
        // Items
        const limitItemsNum = this.limitItemsNum();
        const limitItems = untracked(() => {
          return this.limitItems().map((it) => ({
            ...it,
            num: limitItemsNum[it.id],
          }));
        });
        const ignoreCollectionDevices = this.ignoreCollectionDevices();
        untracked(() => {
          const needRemoveObj = this.objectivesSvc
            .baseObjectives()
            .filter(
              (it) =>
                it.type === ObjectiveType.ItemLimit ||
                it.type === ObjectiveType.ItemSupply ||
                it.type === ObjectiveType.ItemSupplyUnlimited,
            )
            .map((it) => it.id);
          if (needRemoveObj.length > 0)
            this.objectivesSvc.removeMulti(needRemoveObj);
        });
        untracked(() => {
          const needAdd = limitItems.flatMap<ObjectiveBase>((it) => {
            const miningLimit: ObjectiveBase = {
              targetId: it.recipe,
              unit: ObjectiveUnit.Machines,
              type: ObjectiveType.ItemLimit,
              value: ignoreCollectionDevices
                ? rational.zero
                : it.num.div(rational20),
            };
            if (!ignoreCollectionDevices) return [miningLimit];
            return [
              miningLimit,
              {
                targetId: it.id,
                unit: ObjectiveUnit.Items,
                type: ObjectiveType.ItemSupply,
                value: it.num.mul(rateFactor),
              },
            ];
          });
          if (ignoreCollectionDevices) {
            needAdd.push(
              ...ignoredCollectionRecipeIds.map<ObjectiveBase>((targetId) => ({
                targetId,
                unit: ObjectiveUnit.Machines,
                type: ObjectiveType.ItemLimit,
                value: rational.zero,
              })),
              ...unlimitedSupplyItemIds.map<ObjectiveBase>((targetId) => ({
                targetId,
                unit: ObjectiveUnit.Items,
                type: ObjectiveType.ItemSupplyUnlimited,
                value: rational.zero,
              })),
            );
          }
          if (needAdd.length > 0) this.objectivesSvc.addMulti(needAdd);
        });
      }
      {
        // Custom inputs
        const customInputs = this.customInputs();
        untracked(() => {
          const needRemoveObj = this.objectivesSvc
            .baseObjectives()
            .filter((it) => it.type === ObjectiveType.CustomItemSupply)
            .map((it) => it.id);
          if (needRemoveObj.length > 0)
            this.objectivesSvc.removeMulti(needRemoveObj);
        });
        if (customInputs.length > 0) {
          untracked(() => {
            this.objectivesSvc.addMulti(
              customInputs.map<ObjectiveBase>((it) => ({
                targetId: it.id,
                unit: ObjectiveUnit.Items,
                type: ObjectiveType.CustomItemSupply,
                value: it.num.mul(rateFactor),
              })),
            );
          });
        }
      }
      {
        // Machines
        const limitMachinesNum = this.limitMachinesNum();
        const limitMachines = untracked(() => {
          return this.limitMachines().map((it) => ({
            id: it,
            num: limitMachinesNum[it],
          }));
        });
        const removeLimits = (): void => {
          untracked(() => {
            const needRemoveObj = this.objectivesSvc
              .baseObjectives()
              .filter((it) => it.type === ObjectiveType.MachineLimit)
              .map((it) => it.id);
            if (needRemoveObj.length > 0)
              this.objectivesSvc.removeMulti(needRemoveObj);
          });
        };
        if (this.enableLimitMachines()) {
          removeLimits();
          untracked(() => {
            const needAdd = limitMachines.map<ObjectiveBase>((it) => ({
              targetId: it.id,
              unit: ObjectiveUnit.Items,
              type: ObjectiveType.MachineLimit,
              value: it.num,
            }));
            if (needAdd.length > 0) this.objectivesSvc.addMulti(needAdd);
          });
        } else {
          removeLimits();
        }
      }
      {
        // Transfer
        untracked(() => {
          const needRemoveObj = this.objectivesSvc
            .baseObjectives()
            .filter((it) => it.type === ObjectiveType.DomainTransfer)
            .map((it) => it.id);
          if (needRemoveObj.length > 0)
            this.objectivesSvc.removeMulti(needRemoveObj);
        });
        if (this.enableDomainTransfer()) {
          const transferSource = this.transferSource();
          if (transferSource && transferSource.length > 0) {
            const obj: ObjectiveBase = {
              targetId: `domain_key_${transferSource}`,
              unit: ObjectiveUnit.Items,
              type: ObjectiveType.DomainTransfer,
              value: rational.one.mul(rateFactor),
            };
            untracked(() => {
              this.objectivesSvc.add(obj);
            });
          }
        }
      }
    });
  }

  updateItemLimits(id: string, num: Rational): void {
    this.limitItemsNum.set({ ...this.limitItemsNum(), [id]: num });
  }

  updateMachineLimits(id: string, num: Rational): void {
    this.limitMachinesNum.set({ ...this.limitMachinesNum(), [id]: num });
  }

  protected addCustomInput(id: string): void {
    if (!id || this.customInputs().some((it) => it.id === id)) return;
    this.customInputs.update((inputs) => [
      ...inputs,
      { id, num: rational.zero },
    ]);
  }

  protected updateCustomInputNum(id: string, num: Rational): void {
    this.customInputs.update((inputs) =>
      inputs.map((it) => (it.id === id ? { ...it, num } : it)),
    );
  }

  protected removeCustomInput(id: string): void {
    this.customInputs.update((inputs) => inputs.filter((it) => it.id !== id));
  }

  applyOneKey(oneKeyId: string): void {
    const cfg = this.oneKeyConfig.find((it) => it.id === oneKeyId);
    if (!cfg) return;
    this.applyOneKeyConfig(cfg);
  }

  applyOneKeyConfig(cfg: (typeof this.oneKeyConfig)[number]): void {
    // 物品限制更新
    const limitItems = cfg.limitItems;
    this.limitItemsNum.update((old) => {
      Object.keys(old).forEach((k) => (old[k] = rational.zero));
      limitItems?.forEach((it) => (old[it.id] = it.num));
      return { ...old };
    });
    if (cfg.customInputs != null) {
      this.customInputs.set([...cfg.customInputs]);
    }
    // 机器限制更新
    const limitMachines = cfg.limitMachines;
    this.enableLimitMachines.set(!!limitMachines?.length);
    this.limitMachinesNum.update((old) => {
      Object.keys(old).forEach((k) => (old[k] = rational.zero));
      limitMachines?.forEach((it) => (old[it.id] = it.num));
      return { ...old };
    });
    // 地点更新
    if (cfg.location) {
      this.settingsSvc.updateField(
        'locationIds',
        new Set([cfg.location]),
        this.settings().defaultLocationIds,
      );
    } else if (cfg.clearLoc) {
      this.settingsSvc.updateField(
        'locationIds',
        this.settings().defaultLocationIds,
        this.settings().defaultLocationIds,
      );
    }
    // 跨地区传输更新
    if (cfg.transferSource) {
      this.enableDomainTransfer.set(true);
      this.transferSource.set(cfg.transferSource);
    } else {
      this.enableDomainTransfer.set(false);
      this.transferSource.set('');
    }
    // 自动计算行为更新
    if (cfg.disableWaterNode != null) {
      if (cfg.id === 'load') {
        this.disableWaterNode.set(cfg.disableWaterNode);
      } else {
        this.updateWaterNodeSetting(cfg.disableWaterNode);
      }
    }
    if (cfg.ignoreCollectionDevices != null) {
      this.ignoreCollectionDevices.set(cfg.ignoreCollectionDevices);
    }
  }

  protected updateTransferSource($event: string): void {
    if (this.ready()) {
      this.transferSource.set($event);
    }
  }

  protected updateWaterNodeSetting(disable: boolean): void {
    this.disableWaterNode.set(disable);
    const excludedRecipeIds = new Set(this.settings().excludedRecipeIds);
    for (const id of waterNodeRecipeIds) {
      if (disable) excludedRecipeIds.add(id);
      else excludedRecipeIds.delete(id);
    }
    this.settingsSvc.updateField(
      'excludedRecipeIds',
      excludedRecipeIds,
      this.settings().defaultExcludedRecipeIds,
    );
  }
}
