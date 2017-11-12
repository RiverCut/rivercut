
export abstract class ServerState {

  private $$syncKeys: string[];
  private $$syncModels: { [key: string]: any } = {};
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
    (<any>this).prototype.$$syncKeys.forEach(key => {
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

  protected sync(): void {
    (<any>this).prototype.$$syncKeys.forEach(key => {
      const baseRecordPath = `${this.statePath}/${key}`;
      const baseRecord = this.ds.record.getRecord(baseRecordPath);
      baseRecord.set(this[key]);
    });
  }

}
