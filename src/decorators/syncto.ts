
/**
 * Sync data to Deepstream (from the server).
 */
export function syncto(syncKey?: string) {
  return function(target: any, propertyKey: string) {
    target.prototype = target.prototype || {};

    target.prototype.$$syncKeys = target.prototype.$$syncKeys || [];
    target.prototype.$$syncKeys.push(syncKey || propertyKey);
  }
}

// TODO setup another property called $syncKey ($board, for example) and when setting ^, also write the record
