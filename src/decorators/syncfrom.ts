
import { Model } from '../shared/Model';

/**
 * Sync data from Deepstream (to the client). Accepts a class prototype to deserialize into.
 */
export function syncfrom(model: Model, syncKey?: string) {
  return function(target: any, propertyKey: any, descriptor: PropertyDescriptor) {
    target.prototype = target.prototype || {};

    const key = syncKey || propertyKey;

    target.prototype.$$syncKeys = target.prototype.$$syncKeys || [];
    target.prototype.$$syncKeys.push(key);

    target.prototype.$$syncModels = target.prototype.$$syncModels || {};
    target.prototype.$$syncModels[key] = model;
  }
}
