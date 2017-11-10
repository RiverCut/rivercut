
/**
 * Sync data from Deepstream. Accepts a class prototype to deserialize into.
 */
export function sync(model: any) {
  return function(target: any, propertyKey: any) {
    target.prototype = target.prototype || {};

    const key = propertyKey;

    target.prototype.$$syncKeys = target.prototype.$$syncKeys || [];
    target.prototype.$$syncKeys.push(key);

    target.prototype.$$syncModels = target.prototype.$$syncModels || {};
    target.prototype.$$syncModels[key] = model;
  }
}
