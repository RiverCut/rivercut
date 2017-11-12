
import { Subject } from 'rxjs/Subject';

import * as Deepstream from 'deepstream.io-client-js';

export abstract class DeepstreamWrapper {

  private _client: deepstreamIO.Client;

  public connectionState$ = new Subject<string>();
  public error$ = new Subject<any>();

  public get client(): deepstreamIO.Client {
    if(!this._client) throw new Error('No client exists, call init() first');
    return this._client;
  }

  public get uid(): string {
    return this._client.getUid();
  }

  public init(url: string, options?: any): void {
    if(this._client) throw new Error('Client already exists');

    this._client = Deepstream(url, options);

    this.client.on('connectionStateChanged', (state) => {
      this.connectionState$.next(state);
    });

    this.client.on('error', (error, event, topic) => {
      this.error$.next({ error, event, topic });
    });
  }

  public login(opts: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.login(opts, (success, data) => {
        if(success) return resolve(data);
        return reject(data);
      });
    });
  }

  public emit(name, data): Promise<any> {
    const emitData = {
      $$userId: this.uid,
      $$action: name,
      ...data
    };

    return new Promise((resolve, reject) => {
      this.client.rpc.make('user/action', emitData, (error, result) => {
        if(error) return reject(error);
        resolve(result);
      });
    });
  }
}
