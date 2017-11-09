# Rivercut
A game engine built around deepstream.io.

## Features

- A built in gameloop using node-gameloop.
- State syncing using your models (Note, there are [some restrictions on how this works](#model-sync-restrictions))
- Promise wrappers for deepstream functions where applicable
- Observable wrappers for deepstream events where applicable

## Usage
Coming soon.

### Server
__Note: If you don't need a server, you might be better off using deepstream by itself.__

The server portion of the engine has a customizable game loop and state syncing.

### Client

The client portion of the engine will work with your server models to do state syncing.

## Creating a Game
You can either host your own deepstream instance, or sign up for deepstreamHub.

## Other

### Model Sync Restrictions

You can sync models, but they can't have any imports that don't work on client and server. So, importing something like lodash in your model will be fine, but importing any code that's server specific will break on the client. You will want to keep your models thin, and move any needed logic elsewhere.