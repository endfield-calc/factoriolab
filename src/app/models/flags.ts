import { ARKNIGHTS_ENDFIELD_ID } from '~/models/constants';

export type Flag =
  | 'beacons'
  | 'beltStack'
  | 'consumptionAsDrain'
  | 'diminishingBeacons'
  | 'duplicators'
  | 'expensive'
  | 'fuels'
  | 'hideMachineSettings'
  | 'inactiveDrain'
  | 'inserterEstimation'
  | 'flowRate'
  | 'fluidCostRatio'
  | 'maximumFactor'
  | 'minimumFactor'
  | 'minimumRecipeTime'
  | 'miningDepletion'
  | 'miningProductivity'
  | 'miningSpeed'
  | 'miningTechnologyBypassLimitations'
  | 'mods'
  | 'overclock'
  | 'pollution'
  | 'power'
  | 'proliferator'
  | 'quality'
  | 'researchSpeed'
  | 'resourcePurity'
  | 'somersloop'
  | 'wagons';

export type FlagSet =
  | typeof ARKNIGHTS_ENDFIELD_ID
  | 'spa'
  | '2.0'
  | '2.0q'
  | '1.1'
  | '1.1e'
  | 'dsp'
  | 'sfy'
  | 'coi'
  | 'ffy'
  | 'tta'
  | 'fay';

export const flags: Record<FlagSet, Set<Flag>> = {
  spa: new Set([
    'beacons',
    'beltStack',
    'diminishingBeacons',
    'fluidCostRatio',
    'fuels',
    'inserterEstimation',
    'maximumFactor',
    'minimumFactor',
    'miningDepletion',
    'miningProductivity',
    'mods',
    'pollution',
    'power',
    'quality',
    'researchSpeed',
    'wagons',
  ]),
  '2.0': new Set([
    'beacons',
    'diminishingBeacons',
    'fluidCostRatio',
    'fuels',
    'inserterEstimation',
    'maximumFactor',
    'minimumFactor',
    'miningDepletion',
    'miningProductivity',
    'mods',
    'pollution',
    'power',
    'researchSpeed',
    'wagons',
  ]),
  '2.0q': new Set([
    'beacons',
    'diminishingBeacons',
    'fluidCostRatio',
    'fuels',
    'inserterEstimation',
    'maximumFactor',
    'minimumFactor',
    'miningDepletion',
    'miningProductivity',
    'mods',
    'pollution',
    'power',
    'quality',
    'researchSpeed',
    'wagons',
  ]),
  '1.1': new Set([
    'beacons',
    'flowRate',
    'fluidCostRatio',
    'fuels',
    'inserterEstimation',
    'minimumFactor',
    'minimumRecipeTime',
    'miningDepletion',
    'miningProductivity',
    'miningTechnologyBypassLimitations',
    'mods',
    'pollution',
    'power',
    'researchSpeed',
    'wagons',
  ]),
  '1.1e': new Set([
    'beacons',
    'expensive',
    'flowRate',
    'fluidCostRatio',
    'fuels',
    'inserterEstimation',
    'minimumFactor',
    'minimumRecipeTime',
    'miningDepletion',
    'miningProductivity',
    'miningTechnologyBypassLimitations',
    'mods',
    'pollution',
    'power',
    'researchSpeed',
    'wagons',
  ]),
  dsp: new Set([
    'beltStack',
    'fuels',
    'inactiveDrain',
    'miningSpeed',
    'power',
    'proliferator',
  ]),
  [ARKNIGHTS_ENDFIELD_ID]: new Set([
    // TODO 这个flags集是复制的dsp的，需要改为符合终末地的情况
    'beltStack',
    'fuels',
    'miningSpeed',
    'power',
    'proliferator',
  ]),
  sfy: new Set([
    'consumptionAsDrain',
    'overclock',
    'power',
    'resourcePurity',
    'somersloop',
    'wagons',
  ]),
  coi: new Set(['hideMachineSettings']),
  ffy: new Set(['duplicators']),
  tta: new Set(['fuels', 'power']),
  fay: new Set(['fuels', 'power', 'miningSpeed', 'beltStack']),
};
