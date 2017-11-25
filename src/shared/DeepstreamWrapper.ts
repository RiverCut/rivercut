
import * as Deepstream from 'deepstream.io-client-js';

import { Subject } from 'rxjs/Subject';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

export abstract class DeepstreamWrapper {

  private _client: deepstreamIO.Client;
  private _uid: string;

  public connectionState$ = new BehaviorSubject<string>('initialized');
  public error$ = new Subject<any>();

  public get uid() {
    return this._uid;
  }

  public get client(): deepstreamIO.Client {
    if(!this._client) throw new Error('No client exists, call init() first');
    return this._client;
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

  public login(opts?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.login(opts, (success, data) => {
        if(success) {
          this._uid = data.id;
          return resolve(data);
        }
        return reject(data || new Error(`Could not authenticate with options: ${JSON.stringify(opts)}`));
      });
    });
  }

  public close(): void {
    this.client.close();
  }

  public emit(name, data): Promise<any> {
    const emitData = {
      $$action: name,
      $$userId: this.uid,
      ...data
    };

    return new Promise((resolve, reject) => {
      this.client.rpc.make(`action/user`, emitData, (error, result) => {
        if(error) return reject(error);
        resolve(result);
      });
    });
  }
}
