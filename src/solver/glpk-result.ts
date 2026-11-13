import { Interior, MIP, Simplex, Status } from 'glpk-ts';

import { Rational } from '~/rational/rational';

export type GlpkReturnCode =
  | Simplex.ReturnCode
  | Interior.ReturnCode
  | MIP.ReturnCode;

export interface GlpkResult {
  surplus: Record<string, Rational>;
  recipes: Record<string, Rational>;
  unproduceable: Record<string, Rational>;
  excluded: Record<string, Rational>;
  cost: Rational;
  /** Absent when an exact model check proves infeasibility before GLPK runs. */
  returnCode?: GlpkReturnCode;
  status: Status;
  unboundedRecipeId?: string;
  error: boolean;
  time: number;
}
