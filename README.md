# Description
`xup-proxy` is a websockets proxy for all the [Unoparty](https://unoparty.io) subsystems.

# Installation
For a simple Docker-based install of the Unoparty software stack, see [this guide](http://counterparty.io/docs/federated_node/).

Manual installation can be done by:

```bash
git clone https://github.com/terhnt/xup-proxy
cd xup-proxy
npm install
npm start
```

The server expects several environment variables to point at the respective backend servers.

The available environment variables along with their defaults are:

```bash
SECRETS_PATH=./
HTTP_PORT=8197
ADDRINDEXRS_URL=tcp://localhost:8122
UNOPARTY_URL=http://rpc:rpc@localhost:4120
UNOBTANIUM_ZMQ_URL=tcp://localhost:48832
REDIS_URL=redis://localhost:6379/8
SESSION_SECRET=configure this!
INTERVAL_CHECK_COUNTERPARTY_PARSED=1000
```

You can include them in a `secrets` file and point it by setting the SECRETS_PATH
environment variable to it.

# License
Read LICENSE
