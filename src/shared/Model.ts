
import { merge } from 'lodash';

export class Model {

  public deserializeFrom(opts = {}): void {
    merge(this, opts);
  }

}
