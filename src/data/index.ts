import { AppData } from '~/models/app-data';
import { ARKNIGHTS_ENDFIELD_ID } from '~/models/constants';
import { Game } from '~/models/enum/game';

export const data: AppData = {
  mods: [
    {
      id: ARKNIGHTS_ENDFIELD_ID,
      name: '明日方舟：终末地',
      game: Game.ArknightsEndfield,
      flags: ARKNIGHTS_ENDFIELD_ID,
    },
    { id: '1.1', name: '1.1', game: Game.Factorio, flags: '1.1' },
    { id: '1.0', name: '1.0', game: Game.Factorio, flags: '1.1' },
  ],
  // 下面的两个hash的数组顺序与测试有关，如果不想改单元测试的话就不要动已有的值，需要的话只新增
  modHashV0: ['1.1', '1.0', ARKNIGHTS_ENDFIELD_ID],
  modHash: [
    '1.1',
    '1.0',
    // 由于单元测试里有sxp，所以需要保证sxp的位置和以前相同(或者也可以改单元测试，但是研究起来比较麻烦)
    ...Array<string>(13).fill(''),
    'sxp',
    ARKNIGHTS_ENDFIELD_ID,
  ],
};
