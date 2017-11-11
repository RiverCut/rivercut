
import { DeepstreamWrapper } from '../shared/DeepstreamWrapper';

export class Client extends DeepstreamWrapper {

  public init(url: string, options?: any): void {
    super.init(url, options);
  }

  public join(roomName: string): Promise<any> {
    return this.emit('rivercut:join', { room: roomName });
  }

  public leave(roomName: string): Promise<any> {
    return this.emit('rivercut:leave', { room: roomName });
  }
}
