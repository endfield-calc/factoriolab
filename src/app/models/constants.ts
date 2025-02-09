import { environment } from '../../environments';
import { Entities } from './utils';

export const APP = 'FactorioLab';

export const ARKNIGHTS_ENDFIELD_ID = 'aef';
export const DEFAULT_MOD = environment.production
  ? // istanbul ignore next: Don't test default mod set to endfield for production
    ARKNIGHTS_ENDFIELD_ID
  : 'spa';

export const MIN_LINK_VALUE = 1e-10;
export const MIN_ZIP = 200;
export const ZEMPTY = '_';
export const ZARRAYSEP = '~';
export const ZFIELDSEP = '*';
export const ZTRUE = '1';
export const ZFALSE = '0';
export const ZBASE64ABC =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-.';
export const ZMAX = ZBASE64ABC.length;
export const ZMAP = ZBASE64ABC.split('').reduce((e: Entities<number>, c, i) => {
  e[c] = i;
  return e;
}, {});
