
import * as Deepstream from 'deepstream.io-client-js';
import { Subject } from 'rxjs';
import { Room } from './Room';

export class Server {

  private _client: deepstreamIO.Client;
  private roomHash: { [key: string]: Room } = {};

  public connectionState$ = new Subject<deepstreamIO.ConnectionState>();
  public error$ = new Subject<any>();

  public roomsPerWorker: number = 1;

  constructor({ roomsPerWorker } = {}) {
    this.roomsPerWorker = roomsPerWorker;
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

    this._client.on('connectionStateChanged', state => this.connectionState$.next(state));
    this._client.on('error', (error, event, topic) => this.error$.next({ error, event, topic }));
  }

  public login(opts: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this._client.login(opts, (success, data) => {
        if(success) return resolve(data);
        return reject(data);
      });
    });
  }

  public registerRoom(roomName: string, roomProto: Room, opts?: any = {}): void {
    if(this.roomHash[roomName]) throw new Error(`Room ${roomName} already exists on this node.`);

    const roomOpts = {
      roomId: Object.keys(this.roomHash).length + 1,
      roomName,
      onDispose: () => this.unregisterRoom(roomName)
    };

    const roomInst = new roomProto(this.client, roomOpts);
    roomInst.opts = opts;
    roomInst.onInit();

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

  // TODO on connect, create the desired room and route the client to it, or just route the client to it if it exists

  // TODO use presence to watch for connections and route them accordingly
}
