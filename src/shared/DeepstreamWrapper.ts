
import * as Deepstream from 'deepstream.io-client-js';

import { Subject } from 'rxjs/Subject';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

export abstract class DeepstreamWrapper {

  private _client: deepstreamIO.Client;
  private _uid: string;

  public connectionState$ = new BehaviorSubject<string>('initialized');
  public error$ = new Subject<any>();

  /**
   * Get the id associated with this connection.
   * @returns {string}
   */
  public get uid() {
    return this._uid;
  }

  /**
   * Get the client associated with this connection.
   * @returns {deepstreamIO.Client}
   */
  public get client(): deepstreamIO.Client {
    if(!this._client) throw new Error('No client exists, call init() first');
    return this._client;
  }

  /**
   * Initialize the connection to Deepstream based on the `url`. Options are passed to the `Deepstream` constructor.
   * @param {string} url
   * @param options
   */
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

  /**
   * Login to Deepstream. Options are passed to `Deepstream.login`.
   * @param opts
   * @returns {Promise<any>}
   */
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

  /**
   * Close the current connection.
   */
  public close(): void {
    this.client.close();
    delete this._client;
    delete this._uid;
  }

  /**
   * Emit data to all servers, seeing a response.
   * @param name
   * @param data
   * @returns {Promise<any>}
   */
  public emit(name, data): Promise<any> {
    const emitData = {
      $$action: name,
      $$userId: this.uid,
      ...data
    };

    return new Promise((resolve, reject) => {
      this.client.rpc.make(`action/user`, emitData, (error, result) => {
        if(error) {
          error = `${error} (${name} -> ${JSON.stringify(emitData)})`;
          return reject(error);
        }
        resolve(result);
      });
    });
  }
}
