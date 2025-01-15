import { ARKNIGHTS_ENDFIELD_ID } from '~/models/constants';

import { Game } from './enum/game';

/** Game information, nonconfigurable */
export interface GameInfo {
  icon: string;
  route: string;
  label: string;
  modId: string;
}

/** Game information data, nonconfigurable */
export const gameInfo: Record<Game, GameInfo> = {
  [Game.ArknightsEndfield]: {
    icon: 'ark-endfield',
    route: `/${ARKNIGHTS_ENDFIELD_ID}`,
    label: 'options.game.arknightsEndfield',
    modId: ARKNIGHTS_ENDFIELD_ID,
  },
  [Game.Factorio]: {
    icon: 'factorio',
    route: '/spa',
    label: 'options.game.factorio',
    modId: 'spa',
  },
  [Game.DysonSphereProgram]: {
    icon: 'dyson-sphere-program',
    route: '/dsp',
    label: 'options.game.dysonSphereProgram',
    modId: 'dsp',
  },
  [Game.Satisfactory]: {
    icon: 'satisfactory',
    route: '/sfy',
    label: 'options.game.satisfactory',
    modId: 'sfy',
  },
  [Game.CaptainOfIndustry]: {
    icon: 'captain-of-industry',
    route: '/coi',
    label: 'options.game.captainOfIndustry',
    modId: 'coi',
  },
  [Game.FinalFactory]: {
    icon: 'final-factory',
    route: '/ffy',
    label: 'options.game.finalFactory',
    modId: 'ffy',
  },
  [Game.Techtonica]: {
    icon: 'techtonica',
    route: '/tta',
    label: 'options.game.techtonica',
    modId: 'tta',
  },
};
