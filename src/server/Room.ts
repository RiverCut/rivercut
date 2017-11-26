
import { ServerState } from './ServerState';

import { clearGameLoop, setGameLoop } from 'node-gameloop';

import { pull, isUndefined, difference } from 'lodash';

export class RoomOpts {
  serializeByRoomId?: boolean;
  singleInstance?: boolean;
  extra?: any;
}

export abstract class Room<T extends ServerState = any> {

  public state: T;

  protected opts: RoomOpts = {};
  protected runWhenEmpty: boolean;
  protected connectedClients: any[] = [];
  protected ds: deepstreamIO.Client;

  private serverOpts: any = {};
  private gameLoopInterval = 1000 / 30;
  private gameloop: number;
  private disconnectServerCallback: Function;
  private disposeServerCallback: Function;
  private eventListenerCallback: Function;
  private uneventListenerCallback: Function;
  private roomId: string;
  private roomName: string;
  private roomInfo: deepstreamIO.Record;

  private isStateReady: Promise<any>;

  /**
   * Get the current room id. The roomId is immutable once created.
   * @returns {string}
   */
  public get id(): string {
    return this.roomId;
  }

  /**
   * Get the current room name. The roomName is immutable once created.
   * @returns {string}
   */
  public get name(): string {
    return this.roomName;
  }

  public setup(ds: deepstreamIO.Client, { roomId, roomName, onDisconnect, onDispose, onEvent, offEvent, serverOpts }) {
    this.ds = ds;
    this.roomId = roomId;
    this.roomName = roomName;
    this.eventListenerCallback = onEvent;
    this.uneventListenerCallback = offEvent;
    this.disconnectServerCallback = onDisconnect;
    this.disposeServerCallback = onDispose;
    this.serverOpts = serverOpts;

    // add this roomId to roomInfoList
    this.roomInfo = this.ds.record.getRecord(`roomInfo/${this.roomId}`);
    this.onSetup();
  }

  /**
   * Set the game loop interval for the current room. <= 0 will disable the game loop.
   * @param {number} ms
   */
  public setGameLoopInterval(ms: number) {
    this.gameLoopInterval = ms;
    this.restartGameloop();
  }

  /**
   * Do an async operation to determine if a client can join this room.
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  public async canJoin(userId?: string): Promise<boolean> {
    return true;
  }

  /**
   * Set the state and set it up right away.
   * @param {T} state
   */
  protected setState(state: T): void {
    this.state = state;
    this.state.setup(this.ds, this.serverOpts);
  }

  /**
   * Called when a tick for the room happens.
   * @param {number} delta - the delta since the last tick.
   */
  protected abstract onTick(delta: number): void;

  /**
   * Called when a client connects to this room. The state has been initialized (and synced) by the time this is called.
   * @param {string} clientId
   */
  protected abstract onConnect(clientId: string): void;

  /**
   * Called when a client disconnects from this room.
   * @param {string} clientId
   */
  protected abstract onDisconnect(clientId: string): void;

  /**
   * Called after the room has been initialized. The state is not necessarily ready yet. The roomList has been notified this room exists.
   */
  protected abstract onInit(): void;

  /**
   * Called after all clients have disconnected (if `runWhenEmpty` is not set). Will call onDispose after its completion.
   */
  protected abstract onUninit(): void;

  /**
   * Called after setup is complete. This is when you should set the state, but not much else is ready at this time.
   */
  protected abstract onSetup(): void;

  /**
   * Called when the room is getting cleaned up. All users are gone at this point.
   */
  protected abstract onDispose(): void;

  /**
   * Listen for an event and register a callback for it.
   * @param {string} event
   * @param callback
   */
  protected on(event: string, callback) {
    this.eventListenerCallback(`${this.roomId}.${event}`, callback);
  }

  /**
   * Stop listening to all instances of `event`.
   * @param {string} event
   */
  protected off(event: string) {
    this.uneventListenerCallback(`${this.roomId}.${event}`);
  }

  public init(): void {
    this.ds.record.getRecord('roomList').set(this.roomId, true);
    this.onInit();
    this.isStateReady = this.state.init();
    this.restartGameloop();
  }

  public uninit(): void {
    if(isUndefined(this.gameloop)) throw new Error('Cannot uninit() a room that has not been created');
    clearGameLoop(this.gameloop);

    this.connectedClients.forEach(client => this.forciblyDisconnect(client));
    this.ds.record.getRecord('roomList').set(this.roomId, undefined);
    this.onUninit();
    this.state.uninit();
    delete this.state;

    this.dispose();
  }

  public async connect(clientId: string) {
    this.connectedClients.push(clientId);

    await this.isStateReady;
    this.onConnect(clientId);
  }

  public disconnect(clientId: string) {
    pull(this.connectedClients, clientId);

    this.onDisconnect(clientId);

    if(!this.runWhenEmpty && this.connectedClients.length === 0) this.uninit();
  }

  /**
   * Forcibly kick a client from this room.
   * @param {string} clientId
   */
  public forciblyDisconnect(clientId: string) {
    this.disconnectServerCallback(clientId);
  }

  private dispose() {
    this.roomInfo.delete();
    this.onDispose();
    this.disposeServerCallback();
  }

  private tick(delta: number) {
    if(!this.state) return;

    this.onTick(delta);
    this.state.tick(delta);
  }

  private restartGameloop(): void {
    if(!isUndefined(this.gameloop)) clearGameLoop(this.gameloop);

    if(this.gameLoopInterval <= 0) return;

    this.gameloop = setGameLoop(delta => {
      this.tick(delta);
    }, this.gameLoopInterval);
  }

  /**
   * Send a message to a particular client.
   * @param {string} clientId
   * @param {Object} message
   */
  public sendMessage(clientId: string, message: Object): void {
    this.ds.event.emit(`message/${clientId}`, message);
  }

  /**
   * Send a message to all clients not excluded by the `exclude` clientId list.
   * @param {Object} message
   * @param {string[]} exclude
   */
  public broadcast(message: Object, exclude: string[] = []): void {
    const recipients = difference(this.connectedClients, exclude);
    recipients.forEach(client => this.sendMessage(client, message));
  }

  /**
   * Update the roomInfo with the current state of this room.
   * @param obj
   */
  protected updateRoomInfo(obj: any) {
    this.roomInfo.set(obj);
  }
}
