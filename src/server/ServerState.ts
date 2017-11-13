
import { get } from 'lodash';

export abstract class ServerState {

  private $$syncKeys: string[];
  private $$syncModels: { [key: string]: any };
  private ds: deepstreamIO.Client;

  // used for state path
  private $$roomName: string;
  private $$serverNamespace: string;
  private $$roomId: boolean;

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
    const syncKeys = get(this, 'prototype.$$syncKeys', []);

    syncKeys.forEach(key => {
      const baseValue = this[key];

      const baseRecordPath = `${this.statePath}/${key}`;
      const baseRecord = this.ds.record.getRecord(baseRecordPath);
      baseRecord.whenReady(record => {

        // try to deserialize it if we can
        const deserializeModel = this.$$syncModels[key];
        if(deserializeModel) {
          const model = new deserializeModel();
          model.deserializeFrom(record.get());
          this[key] = model;
          return;
        }

        // otherwise just set it to the plain object
        this[key] = record.get() || baseValue;
      });
    });

    this.onInit();
  };

  public uninit(): void {
    this.onUninit();
  }

  private syncSpecificKey(key: string) {
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
