
import { get } from 'lodash';

export abstract class ServerState {

  private $$syncKeys: string[];
  private $$syncModels: { [key: string]: any };
  private ds: deepstreamIO.Client;

  // used for state path
  private $$roomName: string;
  private $$serverNamespace: string;
  private $$roomId: boolean;

  // used to know when all models have loaded
  private canSync: boolean;

  public get statePath(): string {
    let base = ``;
    if(this.$$serverNamespace)  base = `${this.$$serverNamespace}`;
    if(this.$$roomId)           base = `${base}/${this.$$roomId}`;
    if(this.$$roomName)         base = `${base}/${this.$$roomName}`;
    base = `${base}/state`;
    return base;
  }

  public abstract onTick(): void;
  public abstract onInit(): void;
  public abstract onUninit(): void;

  public setup(ds: deepstreamIO.Client, opts: any = {}) {
    if(this.ds) throw new Error('State already setup');

    this.ds = ds;
    this.$$roomName = opts.$$roomName;
    this.$$serverNamespace = opts.$$serverNamespace;
    this.$$roomId = opts.$$roomId;
  }

  public tick(delta?: number): void {
    this.onTick();
    this.sync();
  }

  public init(): void {
    const syncKeys = get(this, '$$syncKeys', []);

    const syncPromises = syncKeys.map(key => {
      return new Promise(resolve => {
        const baseValue = this[key];

        const baseRecordPath = `${this.statePath}/${key}`;
        const baseRecord = this.ds.record.getRecord(baseRecordPath);
        baseRecord.whenReady(record => {

          const recordData = record.get();

          // try to deserialize it if we can
          const deserializeModel = this.$$syncModels[key];
          if(deserializeModel) {
            const model = new deserializeModel();
            model.deserializeFrom(recordData);
            this[key] = model;
            return resolve();
          }

          // otherwise just set it to the plain object
          this[key] = recordData || baseValue;
          resolve();
        });
      });
    });

    Promise.all(syncPromises)
      .then(() => {
        this.canSync = true;
        this.onInit();
      });

  };

  public uninit(): void {
    this.onUninit();
  }

  private syncSpecificKey(key: string) {
    if(!this.canSync) return;
    const baseRecordPath = `${this.statePath}/${key}`;
    const baseRecord = this.ds.record.getRecord(baseRecordPath);
    baseRecord.set(this[key]);
  }

  protected sync(): void {
    this.$$syncKeys.forEach(key => {
      this.syncSpecificKey(key);
    });
  }

  // it would be nice if this could sync manually in the setter for MANUAL
  protected forceSyncKey(key: string): void {
    this[key] = this[key];
    this.syncSpecificKey(key);
  }

}
