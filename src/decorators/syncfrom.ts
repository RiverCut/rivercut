
/**
 * Sync data from Deepstream (to the client). Accepts a class prototype to deserialize into.
 */
export function syncfrom() {
  return function(target: any, propertyKey: any, descriptor: PropertyDescriptor) {
    target.$$syncKeys = target.$$syncKeys || [];
    target.$$syncKeys.push(propertyKey);
  }
}
