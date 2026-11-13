import { ProductProfile } from '~/extensions/product-profile';

const labels: Readonly<Record<string, string>> = {
  Item: '物品',
  Items: '产量',
  Surplus: '盈余',
  Inputs: '投入',
  Outputs: '产出',
  Targets: '去向',
  Belts: '传送带数量',
  Belt: '传送带',
  Wagons: '货运数量',
  Wagon: '货运',
  Rockets: '火箭数量',
  Recipe: '配方',
  Machines: '设施数量',
  Machine: '设施',
  Modules: '插件',
  Beacons: '插件效果分享塔',
  Power: '功率 (kW)',
  Pollution: '污染',
};

export const endfieldCsv: ProductProfile['csv'] = {
  entityNames: true,
  bom: true,
  columnLabel: (field, language) =>
    language === 'zh' ? (labels[field] ?? field) : field,
};
