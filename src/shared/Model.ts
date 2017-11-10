
import { extend } from 'lodash';

export class Model {

  public deserializeFrom(opts = {}): void {
    extend(this, opts);
  }

}
