
export enum SyncType {
  AUTOMATIC = 0,
  ON_CHANGE = 1,
  MANUAL    = 2
}

/**
 * Sync data to Deepstream (from the server). Accepts a class prototype to deserialize into and a sync mode
 */
export function SyncTo(model: any, mode: SyncType = SyncType.AUTOMATIC) {
  return function(target: any, propertyKey: any) {

    const key = propertyKey;

    target.$$syncKeys = target.$$syncKeys || [];
    target.$$syncModels = target.$$syncModels || {};

    if(mode === SyncType.AUTOMATIC) {
      target.$$syncKeys.push(key);

      target.$$syncModels[key] = model;

      // TODO it would be nice if this could catch onto the DS instance and sync the data automatically
      // it would also have to watch the object deep somehow
    } else if(mode === SyncType.ON_CHANGE) {
      const privateKey = `$_${key}`;

      const get = () => target[privateKey];
      const set = (val) => {
        if(!target.hasOwnProperty(privateKey)) {
          Object.defineProperty(target, privateKey, {
            value: val,
            enumerable: true,
            writable: true
          });
        }

        target[privateKey] = val;
      };

      if(delete target[key]) {
        Object.defineProperty(target, key, { get, set });
      }
    }

  }
}

/**
 * Sync data from Deepstream (to the client). Accepts a class prototype to deserialize into.
 */
export function SyncFrom(model: any) {
  return function(target: any, propertyKey: any) {
    const key = propertyKey;

    target.$$syncKeys = target.$$syncKeys || [];
    target.$$syncKeys.push(key);

    target.$$syncModels = target.$$syncModels || {};
    target.$$syncModels[key] = model;
  }
}
