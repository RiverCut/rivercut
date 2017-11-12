
import { ServerState } from './ServerState';

import { clearGameLoop, setGameLoop } from 'node-gameloop';

import { pull } from 'lodash';

export abstract class Room<T extends ServerState = ServerState> {

  public roomName: string;
  public state: T;

  protected opts: any = {};
  protected runWhenEmpty: boolean;
  protected connectedClients: any[] = [];

  private ds: deepstreamIO.Client;
  private serverOpts: any = {};
  private roomId: string;
  private gameLoopInterval = 1000 / 30;
  private gameloop: number;
  private disposeServerCallback: Function;

  public setup(ds: deepstreamIO.Client, { roomId, roomName, onDispose, serverOpts }) {
    this.ds = ds;
    this.roomId = roomId;
    this.roomName = roomName;
    this.disposeServerCallback = onDispose;
    this.serverOpts = serverOpts;

    this.onSetup();
  }

  public setGameLoopInterval(ms: number) {
    this.gameLoopInterval = ms;
    this.restartGameloop();
  }

  public async canJoin(userId: string): Promise<boolean> {
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

  public init(): void {
    this.onInit();
    this.state.init();
    this.restartGameloop();
  }

  public uninit(): void {
    if(!this.gameloop) throw new Error('Cannot uninit() a room that has not been created');
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
    this.disposeServerCallback();
    this.onDispose();
  }

  private tick(delta: number) {
    this.onTick(delta);
    this.state.tick(delta);
  }

  private restartGameloop(): void {
    if(this.gameloop) clearGameLoop(this.gameloop);

    this.gameloop = setGameLoop(delta => {
      this.tick(delta);
    }, this.gameLoopInterval);
  }
}
