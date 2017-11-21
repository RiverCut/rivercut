
import { ServerState } from './ServerState';

import { clearGameLoop, setGameLoop } from 'node-gameloop';

import { pull, isUndefined, difference } from 'lodash';

export abstract class Room<T extends ServerState = any> {

  public state: T;

  protected opts: any = {};
  protected runWhenEmpty: boolean;
  protected connectedClients: any[] = [];

  private ds: deepstreamIO.Client;
  private serverOpts: any = {};
  private gameLoopInterval = 1000 / 30;
  private gameloop: number;
  private disposeServerCallback: Function;
  private eventListenerCallback: Function;
  private uneventListenerCallback: Function;
  private roomId: string;
  private roomName: string;

  protected roomInfo: deepstreamIO.Record;

  public get id(): string {
    return this.roomId;
  }

  public get name(): string {
    return this.roomName;
  }

  public setup(ds: deepstreamIO.Client, { roomId, roomName, onDispose, onEvent, offEvent, serverOpts }) {
    this.ds = ds;
    this.roomId = roomId;
    this.roomName = roomName;
    this.eventListenerCallback = onEvent;
    this.uneventListenerCallback = offEvent;
    this.disposeServerCallback = onDispose;
    this.serverOpts = serverOpts;

    this.roomInfo = this.ds.record.getRecord(`_roomInfo/${this.roomId}`);
    this.onSetup();
  }

  public setGameLoopInterval(ms: number) {
    this.gameLoopInterval = ms;
    this.restartGameloop();
  }

  public async canJoin(userId?: string): Promise<boolean> {
    return true;
  }

  protected setState(state: T): void {
    this.state = state;
    this.state.setup(this.ds, this.serverOpts);
  }

  protected abstract onTick(delta: number): void;
  protected abstract onConnect(clientId: string): void;
  protected abstract onDisconnect(clientId: string): void;
  protected abstract onInit(): void;
  protected abstract onUninit(): void;
  protected abstract onSetup(): void;
  protected abstract onMessage(): void;
  protected abstract onDispose(): void;

  protected on(event: string, callback) {
    this.eventListenerCallback(`${this.roomId}.${event}`, callback);
  }

  protected off(event: string) {
    this.uneventListenerCallback(`${this.roomId}.${event}`);
  }

  public init(): void {
    this.onInit();
    this.state.init();
    this.restartGameloop();
  }

  public uninit(): void {
    if(isUndefined(this.gameloop)) throw new Error('Cannot uninit() a room that has not been created');
    this.onUninit();
    this.state.uninit();
    delete this.state;
    clearGameLoop(this.gameloop);

    this.dispose();
  }

  public connect(clientId: string) {
    this.connectedClients.push(clientId);
    this.onConnect(clientId);
  }

  public disconnect(clientId: string) {
    pull(this.connectedClients, clientId);

    this.onDisconnect(clientId);

    if(!this.runWhenEmpty && this.connectedClients.length === 0) this.uninit();
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

    this.gameloop = setGameLoop(delta => {
      this.tick(delta);
    }, this.gameLoopInterval);
  }

  public sendMessage(clientId: string, message: Object): void {
    this.ds.event.emit(`message/${clientId}`, message);
  }

  public broadcast(message: Object, exclude: string[] = []): void {
    const recipients = difference(this.connectedClients, exclude);
    recipients.forEach(client => this.sendMessage(client, message));
  }
}
