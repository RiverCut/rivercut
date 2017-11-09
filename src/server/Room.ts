
import { ServerState } from './ServerState';

import { clearGameLoop, setGameLoop } from 'node-gameloop';

export abstract class Room<T extends ServerState> {

  public roomName: string;
  public opts: any = {};
  public state: T;

  protected runWhenEmpty: boolean;
  protected connectedClients: any[] = [];

  private roomId: string;
  private gameLoopInterval = 1000 / 30;
  private gameloop: number;
  private disposeServerCallback: Function;

  constructor(
    protected ds: deepstreamIO.Client,
    { roomId, roomName, onDispose }
  ) {
    this.roomId = roomId;
    this.roomName = roomName;
    this.disposeServerCallback = onDispose;
  }

  public setGameLoopInterval(ms: number) {
    this.gameLoopInterval = ms;
    this.restartGameloop();
  }

  public async canJoin(): Promise<boolean> {
    return true;
  }

  protected abstract tick(delta: number): void;

  protected abstract onMessage(): void;

  protected onInit(): void {
    this.state = new T(this.ds);
    this.state.onInit();
    this.restartGameloop();
  }

  protected onUninit(): void {
    if(!this.gameloop) throw new Error('Cannot uninit() a room that has not been created');
    this.state.onDispose();
    delete this.state;
    clearGameLoop(this.gameloop);

    this.onDispose();
  }

  protected onConnect(clientId: string) {
    this.connectedClients.push(clientId);
  }

  protected onDisconnect(clientId: string) {
    pull(this.connectedClients, clientId);

    if(!this.runWhenEmpty && this.connectedClients.length === 0) this.onUninit();
  }

  protected onDispose() {
    this.disposeServerCallback();
  }

  private restartGameloop(): void {
    if(this.gameloop) clearGameLoop(this.gameloop);

    this.gameloop = setGameLoop(delta => {
      this.tick(delta);
      this.state.tick(delta);
    }, this.gameLoopInterval);
  }
}
