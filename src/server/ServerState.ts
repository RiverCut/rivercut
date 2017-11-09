
export abstract class ServerState {

  constructor(
    protected ds: deepstreamIO.Client
  ) {}

  protected abstract tick(delta: number): void;
  protected abstract onInit(): void;
  protected abstract onDispose(): void;

  // TODO on tick, sync state with records
}
