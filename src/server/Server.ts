
import * as uuid from 'uuid/v4';
import * as uuid5 from 'uuid/v5';

import { find, filter } from 'lodash';

import { DeepstreamWrapper } from '../shared/DeepstreamWrapper';
import { Room } from 'server/Room';

// TODO need to keep a map of clientUser <-> room instance(s) so they knows where to send updates
// TODO ^ rooms need to know about clientRooms

export class Server extends DeepstreamWrapper {

  private roomHash: any = {};
  private runningRoomHash: any = {};
  private runningRooms: number = 0;
  private serverUUID: string;
  private actionCallbacks: { [key: string]: (data: any, response: deepstreamIO.RPCResponse) => any } = {};
  private clientRooms: { [key: string]: Array<{ name: string, id: string }> } = {};

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
    this.trackPresence();
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
    return this.runningRoomHash[roomName] && Object.keys(this.runningRoomHash[roomName]).length > 0;
  }

  private isFull(): boolean {
    return this.runningRooms >= this.roomsPerWorker;
  }

  private findRoomToConnectTo(roomName: string, userId: string): Promise<Room> {
    return new Promise(async (resolve) => {
      const roomHash = this.runningRoomHash;
      const allRooms = Object.keys(roomHash[roomName]) || [];

      if(!allRooms.length) return resolve(null);

      function* nextRoom() {
        for(let i = 0; i < allRooms.length; i++) {
          yield roomHash[roomName][allRooms[i]];
        }
      }

      const gen = nextRoom();

      let chosenRoom = null;

      for(const currentRoom of gen) {
        const canJoin = await currentRoom.canJoin(userId);
        if(canJoin) {
          chosenRoom = currentRoom;
          break;
        }
      }

      resolve(chosenRoom);
    });
  }

  private watchForBasicEvents(): void {

    this.client.rpc.provide('useraction', async (data, response) => {
      const callback = this.actionCallbacks[data.$$action];
      if(!callback) {
        response.error(`Action ${data.$$action} has no registered callback.`);
        return;
      }

      const result = await callback(data, response);

      if(!result) return;
      response.send(result);
    });

    this.on('rivercut:join', (data, response) => {
      const { room, $$userId } = data;

      (<any>response).autoAck = false;

      return new Promise(async (resolve) => {

        const ackAndReject = () => {
          response.ack();
          response.reject();

          resolve(null);
        };

        const getResponseData = (room) => {
          const resolveData = {
            statePath: room.state.statePath
          };

          resolve(resolveData);
        };

        const sendError = (message: string) => {
          response.error(message);

          resolve(null);
        };

        if(this.isFull()) {
          // if we don't have a running room, and we're full, there is nowhere to go
          const hasRunningRoom = this.hasRunningRoom(room);
          if(!hasRunningRoom) return ackAndReject();

          // if we don't have a room to connect to, and we're full, there is nowhere to go
          const roomInst = await this.findRoomToConnectTo(room, $$userId);
          if(!roomInst) return ackAndReject();

          response.ack();

          // we can connect to a room, so let's try to do that.
          const didJoin = this.joinRoom($$userId, roomInst);
          if(!didJoin) return sendError('Could not join room');

          return getResponseData(roomInst);
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

          return ackAndReject();
        }

        response.ack();

        // ok, we have a room, we can try to join it
        const didJoin = this.joinRoom($$userId, roomInst);
        if(!didJoin) return sendError('Could not join room');

        return getResponseData(roomInst);
      })
    });

    this.on('rivercut:leave', (data, response) => {
      const { $$userId, room } = data;

      const didLeave = this.leaveRoom($$userId, room);
      if(!didLeave) return response.error('Could not leave room');

      return {};
    });
  }

  private trackPresence(): void {
    this.client.presence.subscribe((userId, isOnline) => {
      if(!isOnline) {
        this.leaveAllRooms(userId);
      }
    });
  }

  private joinRoom(clientId: string, room: Room): boolean {
    const alreadyInRoom = find(this.clientRooms[clientId], { name: room.name, id: room.id });
    if(alreadyInRoom) return false;

    room.connect(clientId);

    this.clientRooms[clientId] = this.clientRooms[clientId] || [];
    this.clientRooms[clientId].push({ name: room.name, id: room.id });
    return true;
  }

  private leaveRoom(clientId: string, roomName: string): boolean {
    if(!this.clientRooms[clientId]) return false;

    let didLeave = false;

    this.clientRooms[clientId].forEach(({ name, id }) => {
      if(name !== roomName) return;

      const room = this.runningRoomHash[name][id];
      room.disconnect(clientId);
      didLeave = true;
    });

    this.clientRooms[clientId] = filter(this.clientRooms[clientId], ({ name }) => name !== roomName);

    return didLeave;
  }

  private leaveAllRooms(clientId: string) {
    if(!this.clientRooms[clientId]) return;

    this.clientRooms[clientId].forEach(({ name, id }) => {
      const room = this.runningRoomHash[name][id];
      room.disconnect(clientId);
    });

    delete this.clientRooms[clientId];
  }
}
