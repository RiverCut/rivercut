
import * as uuid from 'uuid/v4';
import * as uuid5 from 'uuid/v5';

import { DeepstreamWrapper } from '../shared/DeepstreamWrapper';

export class Server extends DeepstreamWrapper {

  private roomHash: any = {};
  private serverUUID: string;
  private actionCallbacks: { [key: string]: Function } = {};

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

    this.trackPresence();
    this.watchForBasicEvents();
  }

  public registerRoom(roomName: string, roomProto, opts: any = {}): void {
    if(this.roomHash[roomName]) throw new Error(`Room ${roomName} already exists on this node.`);

    const roomId = uuid5(roomName, this.serverUUID);

    const roomOpts = {
      roomId,
      roomName,
      onDispose: () => this.unregisterRoom(roomName),
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

    this.roomHash[roomName] = roomInst;
  }

  public unregisterRoom(roomName: string) {
    if(!this.roomHash[roomName]) throw new Error(`Room ${roomName} does not exist on this node.`);
    delete this.roomHash[roomName];
  }

  public on(name: string, callback: (data: any, response: deepstreamIO.RPCResponse) => any): void {
    if(!this.client) throw new Error('Client not initialized');
    this.actionCallbacks[name] = callback;
  }

  public off(name): void {
    this.client.rpc.unprovide(name);
  }

  public async canConnect(): Promise<boolean> {
    return Object.keys(this.roomHash).length < this.roomsPerWorker;
  }

  private trackPresence(): void {
    this.client.presence.subscribe((username, isLoggedIn) => {
      console.log(username, isLoggedIn);
    });
  }

  private watchForBasicEvents(): void {
    this.client.rpc.provide('user/action', (data, response) => {
      const callback = this.actionCallbacks[data.$$action];
      if(!callback) {
        response.error(`Action ${data.$$action} has no registered callback.`);
        return;
      }

      const result = callback(data, response);
      response.send(result);
    });

    this.on('rivercut:join', (data) => {
      console.log(data);
    });

    this.on('rivercut:leave', (data) => {
      console.log(data);
    });
  }

  // TODO check if can connect - server either needs to contain the desired room or the server, or there needs to be enough space to make a room

  // TODO on connect, setup the desired room and route the client to it, or just route the client to it if it exists

  // TODO use presence to watch for connections and route them accordingly

  // TODO need to keep a map of clientUser <-> room instance(s) so they knows where to send updates

  // TODO client state needs to have a "base path" sent to it so it knows what to watch

  // TODO client state needs to extend from a model and it should have a basic deserialize function (_.extend, probably)
}
