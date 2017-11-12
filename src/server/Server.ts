
import * as uuid from 'uuid/v4';
import * as uuid5 from 'uuid/v5';

import { find } from 'lodash';

import { DeepstreamWrapper } from '../shared/DeepstreamWrapper';
import { Room } from 'server/Room';

// TODO need to keep a map of clientUser <-> room instance(s) so they knows where to send updates
// TODO implement leave

export class Server extends DeepstreamWrapper {

  private roomHash: any = {};
  private runningRoomHash: any = {};
  private runningRooms: number = 0;
  private serverUUID: string;
  private actionCallbacks: { [key: string]: (data: any, response: deepstreamIO.RPCResponse) => any } = {};

  public roomsPerWorker: number = 1;
  public resetStatesOnReboot: boolean = true;
  public serializeByRoomId: boolean = false;
  public namespace: string = '';

  /**
   * @param {boolean} resetStatesOnReboot - if true, all states will be cleared on reboot
   * @param {boolean} serializeByRoomId - if true, state will save per room id instead of per room
   * @param {number} roomsPerWorker - the maximum number of rooms this server will hold
   * @param {string} namespace - if specified, state data will have `namespace` pre-pended
   */
  constructor(
    {
      roomsPerWorker,
      resetStatesOnReboot,
      serializeByRoomId,
      namespace
    }: any = {}
    ) {
      super();
      this.roomsPerWorker = roomsPerWorker || 1;
      this.resetStatesOnReboot = resetStatesOnReboot || true;
      this.serializeByRoomId = serializeByRoomId || false;
      this.namespace = namespace || '';
    }

  public init(url: string, options?: any): void {
    super.init(url, options);

    this.serverUUID = uuid();

    if(this.resetStatesOnReboot) {
      const record = this.client.record.getRecord(this.namespace);
      record.delete();
    }

    this.watchForBasicEvents();
  }

  public registerRoom(roomName: string, roomProto, opts: any = {}): void {
    if(this.roomHash[roomName]) throw new Error(`Room ${roomName} already registered on this node.`);

    this.roomHash[roomName] = { roomProto: roomProto, opts };
  }

  public unregisterRoom(roomName: string): void {
    if(!this.roomHash[roomName]) throw new Error(`Room ${roomName} is not registered on this node.`);
    delete this.roomHash[roomName];
  }

  private createRoom(roomName: string): Room {
    if(!this.roomHash[roomName]) throw new Error(`Room ${roomName} was not registered on this node.`);
    const { roomProto, opts } = this.roomHash[roomName];

    const roomId = uuid5(roomName, this.serverUUID);

    const roomOpts = {
      roomId,
      roomName,
      onDispose: () => this.deleteRoom(roomName, roomId),
      serverOpts: {
        $$roomId: this.serializeByRoomId ? roomId : null,
        $$serverNamespace: this.namespace,
        $$roomName: roomName
      }
    };

    const roomInst = new roomProto();
    roomInst.setup(this.client, roomOpts);
    roomInst.opts = opts;
    roomInst.init();

    this.runningRooms++;
    this.runningRoomHash[roomName] = this.runningRoomHash[roomName] || {};
    this.runningRoomHash[roomName][roomId] = roomInst;

    return roomInst;
  }

  public deleteRoom(roomName: string, roomId: string): void {
    if(!this.runningRoomHash[roomName]) throw new Error(`Room ${roomName} does not exist on this node.`);

    this.runningRooms--;
    delete this.runningRoomHash[roomName][roomId];
  }

  public on(name: string, callback: (data: any, response: deepstreamIO.RPCResponse) => any): void {
    if(!this.client) throw new Error('Client not initialized');
    this.actionCallbacks[name] = callback;
  }

  public off(name): void {
    this.client.rpc.unprovide(name);
  }

  private hasRunningRoom(roomName: string): boolean {
    return this.runningRooms[roomName] && Object.keys(this.runningRooms[roomName]).length > 0;
  }

  private isFull(): boolean {
    return this.runningRooms < this.roomsPerWorker;
  }

  private findRoomToConnectTo(roomName: string, userId: string): Promise<Room> {
    return new Promise(async (resolve) => {
      const allRooms = this.runningRooms[roomName];

      function* nextRoom() {
        for(let i = 0; i < allRooms.length; i++) {
          yield allRooms[i];
        }
      }

      const gen = nextRoom();

      let chosenRoom = null;

      for(const currentRoom of gen) {
        const canJoin = await currentRoom.canConnect(userId);
        if(canJoin) {
          chosenRoom = currentRoom;
          break;
        }
      }

      resolve(chosenRoom);
    });
  }

  private watchForBasicEvents(): void {
    this.client.rpc.provide('user/action', async (data, response) => {
      const callback = this.actionCallbacks[data.$$action];
      if(!callback) {
        response.error(`Action ${data.$$action} has no registered callback.`);
        return;
      }

      const result = await callback(data, response);
      response.send(result);
    });

    this.on('rivercut:join', async (data, response) => {
      const { room, $$userId } = data;

      (<any>response).autoAck = false;

      if(this.isFull()) {
        // if we don't have a running room, and we're full, there is nowhere to go
        const hasRunningRoom = this.hasRunningRoom(room);
        if(!hasRunningRoom) return response.reject();

        // if we don't have a room to connect to, and we're full, there is nowhere to go
        const roomInst = await this.findRoomToConnectTo(room, $$userId);
        if(!roomInst) return response.reject();

        response.ack();

        // we can connect to a room, so let's do that.
        roomInst.connect($$userId);
        return;
      }

      let isRoomFreshlyCreated = false;
      let newRoom: Room = null;

      // ok, we're not full, so lets see if we have a room anyway
      const hasRunningRoom = this.hasRunningRoom(room);
      if(!hasRunningRoom) {
        // create a room, we'll see if we can join it
        newRoom = this.createRoom(room);
      }

      // if we don't have a room to connect to, we can make one
      const roomInst = await this.findRoomToConnectTo(room, $$userId);
      if(!roomInst) {

        // if we can't join anything and we just made a room, get rid of it
        if(newRoom && isRoomFreshlyCreated) newRoom.uninit();

        response.reject();
        return;
      }

      response.ack();

      // ok, we have a room, we can join it
      roomInst.connect($$userId);

      response.send({
        statePath: roomInst.state.statePath
      });
    });

    this.on('rivercut:leave', (data) => {
      console.log(data);
    });
  }
}
