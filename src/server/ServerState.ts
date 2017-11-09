
export abstract class ServerState {

  private $$syncKeys: string[] = [];
  protected ds: deepstreamIO.Client;
  private $$baseKeyPath: string;

  public create(ds, $$baseKeyPath) {
    if(this.ds) throw new Error('Already created this ServerState');

    this.ds = ds;
    this.$$baseKeyPath = $$baseKeyPath;
  }

  public tick(delta: number): void {
    this.sync();
  }

  public abstract onInit(): void;
  public abstract onDispose(): void;

  protected sync(): void {
    this.$$syncKeys.forEach(key => {
      const baseRecordPath = `state/${this.$$baseKeyPath}/${key}`;
      const baseRecord = this.ds.record.getRecord(baseRecordPath);
      baseRecord.set(this[key]);
    });
  }

  // TODO onInit load all data
  // TODO on tick, sync state with records
}
