
import { Subject } from 'rxjs/Subject';

export class ClientState {

  private $$syncKeys: string[];
  private $$syncModels: { [key: string]: any };
  private recordSubscriptions: { [key: string]: { record, action: Function} } = {};
  private statePath: string;
  private roomId: string;
  private roomName: string;
  private serverId: string;

  public get id(): string {
    return this.roomId;
  }

  public get name(): string {
    return this.roomName;
  }

  public get sid(): string {
    return this.serverId;
  }

  public onUpdate$ = new Subject<any>();

  constructor(private ds: deepstreamIO.Client, { statePath, roomId, roomName, serverId }) {
    this.statePath = statePath;
    this.roomId = roomId;
    this.roomName = roomName;
    this.serverId = serverId;
    this.watchRecords();
  }

  private watchRecords() {
    this.$$syncKeys.forEach(key => {
      const baseRecordPath = `${this.statePath}/${key}`;
      const baseRecord = this.ds.record.getRecord(baseRecordPath);

      const action = (data) => {
        // try to deserialize it if we can
        const deserializeModel = this.$$syncModels[key];
        if(deserializeModel) {
          const model = new deserializeModel();
          model.deserializeFrom(data);
          this[key] = model;
          this.onUpdate$.next({ key, data: this[key] });
          return;
        }

        // otherwise just set it to the plain object
        this[key] = data;
        this.onUpdate$.next({ key, data: this[key] });
      };

      this.recordSubscriptions[key] = { record: baseRecord, action };

      baseRecord.subscribe(action, true);
    });
  }

  public uninit() {
    this.$$syncKeys.forEach(key => {
      const { record, action } = this.recordSubscriptions[key];
      record.unsubscribe(action);
    });
  }
}
