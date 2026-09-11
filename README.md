# Tely's Stream Deck Plugin

Elgato Stream Deck companion for the Foundry VTT module **Tely's Stream Deck
Integration**.

Install `com.telynor.foundry-integration.streamDeckPlugin`, enable the Foundry
module, then configure the same pairing secret on both sides.

The plugin communicates only over `127.0.0.1:17321`. Foundry actions execute in
the connected user's browser and retain that user's document permissions.

## Development

```sh
npm install
npm run build
npx streamdeck validate com.telynor.foundry-integration.sdPlugin
```

