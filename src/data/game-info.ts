import { DEFAULT_MOD } from './datasets';
import { Game } from './game';

/** Game information, nonconfigurable */
export interface GameInfo {
  label: string;
  modId: string;
}

/** Game information data, nonconfigurable */
export const gameInfo: Record<Game, GameInfo> = {
  endfield: { label: 'options.game.endfield', modId: DEFAULT_MOD },
};
