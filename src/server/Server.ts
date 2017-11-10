
import * as Deepstream from 'deepstream.io-client-js';
import { Subject } from 'rxjs';

export class Server {

  private _client: deepstreamIO.Client;
  private roomHash: any = {};

  public connectionState$ = new Subject<string>();
  public error$ = new Subject<any>();

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
      this.roomsPerWorker = roomsPerWorker || 1;
      this.resetStatesOnReboot = resetStatesOnReboot || true;
      this.serializeByRoomId = serializeByRoomId || false;
      this.namespace = namespace || '';
    }

  public get client(): deepstreamIO.Client {
    if(!this._client) throw new Error('No client exists, call init() first');
    return this._client;
  }

  public get uid(): string {
    return this._client.getUid();
  }

  public init(url: string, options?: any): void {
    this._client = Deepstream(url, options);

    if(this.resetStatesOnReboot) {
      const record = this._client.record.getRecord(this.namespace);
      record.delete();
    }

    this._client.on('connectionStateChanged', (state) => {
      this.connectionState$.next(state);
    });

    this._client.on('error', (error, event, topic) => {
      this.error$.next({ error, event, topic });
    });
  }

  public login(opts: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this._client.login(opts, (success, data) => {
        if(success) return resolve(data);
        return reject(data);
      });
    });
  }

  public registerRoom(roomName: string, roomProto, opts: any = {}): void {
    if(this.roomHash[roomName]) throw new Error(`Room ${roomName} already exists on this node.`);

    const roomId = Object.keys(this.roomHash).length + 1;

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

  public async canConnect(): Promise<boolean> {
    return Object.keys(this.roomHash).length < this.roomsPerWorker;
  }

  // TODO check if can connect - server either needs to contain the desired room or the server, or there needs to be enough space to make a room

  // TODO on connect, setup the desired room and route the client to it, or just route the client to it if it exists

  // TODO use presence to watch for connections and route them accordingly

  // TODO need to keep a map of clientUser <-> room instance(s) so they knows where to send updates

  // TODO client state needs to have a "base path" sent to it so it knows what to watch

  // TODO client state needs to extend from a model and it should have a basic deserialize function (_.extend, probably)
}
