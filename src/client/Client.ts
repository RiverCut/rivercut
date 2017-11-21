
import { DeepstreamWrapper } from '../shared/DeepstreamWrapper';
import { Subject } from 'rxjs/Subject';
import { ClientState } from './ClientState';

export class Client extends DeepstreamWrapper {

  public onData$ = new Subject<any>();

  public init(url: string, options?: any): void {
    super.init(url, options);
  }

  public async login(opts: any): Promise<any> {
    const promise = await super.login(opts);
    this.listenForMessages();

    return promise;
  }

  public join(roomName: string, roomId?: string): Promise<any> {
    return this.emit('rivercut:join', { room: roomName, roomId });
  }

  public leave(roomName: string): Promise<any> {
    return this.emit('rivercut:leave', { room: roomName });
  }

  public createState<T extends ClientState>(stateProto, opts = {}): T{
    return new stateProto(this.client, opts);
  }

  private listenForMessages() {
    this.client.event.subscribe(`message/${this.uid}`, (data) => {
      this.onData$.next(data);
    });
  }

  public emitFromState(name, data, state: ClientState): Promise<any> {
    const emitData = {
      $$action: name,
      $$userId: this.uid,
      $$roomId: state.id,
      $$roomName: state.name,
      ...data
    };

    return new Promise((resolve, reject) => {
      this.client.rpc.make(`action/server/${state.sid}`, emitData, (error, result) => {
        if(error) return reject(error);
        resolve(result);
      });
    });
  }

  // TODO make client watch for server disconnect
}
