
import { DeepstreamWrapper } from '../shared/DeepstreamWrapper';
import { Subject } from 'rxjs/Subject';
import { ClientState } from './ClientState';

export class Client extends DeepstreamWrapper {

  public onData$ = new Subject<any>();
  public onServerDisconnect$ = new Subject<any>();
  private _roomInfo: deepstreamIO.Record;
  private connectedServers: { [key: string]: number } = {};

  public get roomInfo(): deepstreamIO.Record {
    return this._roomInfo;
  }

  public init(url: string, options?: any): void {
    super.init(url, options);

    this._roomInfo = this.client.record.getRecord(`roomInfo`);
    this.watchServerPresence();
  }

  public async login(opts: any): Promise<any> {
    const promise = await super.login(opts);
    this.listenForMessages();

    return promise;
  }

  public async join(roomName: string, roomId?: string): Promise<any> {
    const response = await this.emit('rivercut:join', { room: roomName, roomId });
    this.connectedServers[response.serverId] = this.connectedServers[response.serverId] || 0;
    this.connectedServers[response.serverId]++;
    return response;
  }

  public async leave(roomName: string): Promise<any> {
    const response = await this.emit('rivercut:leave', { room: roomName });
    this.connectedServers[response.serverId]--;
    if(this.connectedServers[response.serverId] === 0) delete this.connectedServers[response.serverId];
    return response;
  }

  public async leaveAll(): Promise<any> {
    const response = await this.emit('rivercut:leave-all', {});
    this.connectedServers = {};
    return response;
  }

  public createState<T extends ClientState>(stateProto, opts = {}): T{
    return new stateProto(this.client, opts);
  }

  private listenForMessages() {
    this.client.event.subscribe(`message/${this.uid}`, (data) => {
      this.onData$.next(data);
    });
  }

  public emitFromState(name, data, state: ClientState): Promise<any> {
    const emitData = {
      $$action: name,
      $$userId: this.uid,
      $$roomId: state.id,
      $$roomName: state.name,
      ...data
    };

    return new Promise((resolve, reject) => {
      this.client.rpc.make(`action/server/${state.sid}`, emitData, (error, result) => {
        if(error) return reject(error);
        resolve(result);
      });
    });
  }

  private watchServerPresence() {
    this.client.presence.subscribe((serverId, isOnline) => {
      if(!isOnline && this.connectedServers[serverId]) {
        this.onServerDisconnect$.next({ serverId });
      }
    });
  }

}
