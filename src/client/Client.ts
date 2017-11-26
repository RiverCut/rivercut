
import { DeepstreamWrapper } from '../shared/DeepstreamWrapper';
import { Subject } from 'rxjs/Subject';
import { ClientState } from './ClientState';

import { difference } from 'lodash';

export class Client extends DeepstreamWrapper {

  public onMessage$ = new Subject<any>();
  public onServerDisconnect$ = new Subject<any>();
  public onRoomUpdate$ = new Subject<any>();
  private _roomInfo: any = {};
  private connectedServers: { [key: string]: number } = {};

  public get roomInfo(): any {
    return this._roomInfo;
  }

  public init(url: string, options?: any): void {
    super.init(url, options);

    this.watchServerPresence();
    this.watchRoomInfo();
  }

  public async login(opts: any): Promise<any> {
    const promise = await super.login(opts);
    this.listenForMessages();

    return promise;
  }

  public async join(roomName: string, roomId?: string, opts: any = {}): Promise<any> {
    opts.room = roomName;
    opts.roomId = roomId;
    const response = await this.emit('rivercut:join', opts);
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
    this.connectedServers = {};
    const response = await this.emit('rivercut:leave-all', {});
    return response;
  }

  public createState<T extends ClientState>(stateProto, opts = {}): T{
    return new stateProto(this.client, opts);
  }

  private listenForMessages() {
    this.client.event.subscribe(`message/${this.uid}`, (data) => {
      this.onMessage$.next(data);
    });
  }

  public emitFromState(name, data = {}, state: ClientState): Promise<any> {
    const emitData = {
      $$action: name,
      $$userId: this.uid,
      $$roomId: state.id,
      $$roomName: state.name,
      ...data
    };

    return new Promise((resolve, reject) => {
      this.client.rpc.make(`action/server/${state.sid}`, emitData, (error, result) => {
        if(error) {
          error = `${error} (${state.sid}:${name} -> ${JSON.stringify(emitData)})`;
          return reject(error);
        }
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

  private watchRoomInfo() {

    const roomRecords = {};

    this.client.record.getRecord(`roomList`)
      .subscribe(rooms => {
        const newKeys = Object.keys(rooms);
        const oldKeys = Object.keys(roomRecords);

        const newRooms = difference(newKeys, oldKeys);
        const removeRooms = difference(oldKeys, newKeys);

        newRooms.forEach(newRoom => {
          roomRecords[newRoom] = this.client.record.getRecord(`roomInfo/${newRoom}`);

          roomRecords[newRoom].subscribe(roomInfo => {
            this.roomInfo[newRoom] = roomInfo;
            this.onRoomUpdate$.next({ roomId: newRoom, roomInfo });
          }, true);
        });

        removeRooms.forEach(oldRoom => {
          roomRecords[oldRoom].discard();
          delete roomRecords[oldRoom];
          delete this.roomInfo[oldRoom];
          this.onRoomUpdate$.next({ roomId: oldRoom, roomInfo: {} });
        });

      }, true);
  }

}
