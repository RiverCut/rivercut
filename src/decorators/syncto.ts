
/**
 * Sync data to Deepstream (from the server).
 */
export function syncto() {
  return function(target: any, propertyKey: any, descriptor: PropertyDescriptor) {
    target.$$syncKeys = target.$$syncKeys || [];
    target.$$syncKeys.push(propertyKey);
  }
}
