
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

  public join(roomName: string): Promise<any> {
    return this.emit('rivercut:join', { room: roomName });
  }

  public leave(roomName: string): Promise<any> {
    return this.emit('rivercut:leave', { room: roomName });
  }

  public createState(stateProto, opts = {}): ClientState {
    return new stateProto(this.client, opts);
  }

  private listenForMessages() {
    this.client.event.subscribe(`message/${this.uid}`, (data) => {
      this.onData$.next(data);
    });
  }
}
