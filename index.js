#!/usr/bin/env node

require('dotenv').config({ path: process.env.SECRETS_PATH || './' })
const http = require('http')
const net = require('net')
const { URL } = require('url')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const WebSocket = require('ws')
const expressWs = require('express-ws')
const zmq = require('zeromq')
const session = require('express-session')
const redis = require('redis')
const jayson = require('jayson/promise')
//const mariadb = require('mariadb')
const yargs = require('yargs/yargs')

const HTTP_PORT = parseInt(process.env.HTTP_PORT || 8197)
const ADDRINDEXRS_URL = new URL(process.env.ADDRINDEXRS_URL || 'tcp://localhost:8122')
const UNOPARTY_URL = process.env.UNOPARTY_URL || 'http://rpc:rpc@localhost:4120'
const UNOBTANIUM_ZMQ_URL = process.env.UNOBTANIUM_ZMQ_URL || 'tcp://localhost:48832'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/8'
const DEFAULT_SESSION_SECRET = 'configure this!'
const SESSION_SECRET = process.env.SESSION_SECRET || DEFAULT_SESSION_SECRET

const INTERVAL_CHECK_UNOPARTY_PARSED = parseInt(process.env.INTERVAL_CHECK_UNOPARTY_PARSED || '1000')

async function startZmq(notifiers) {
  const sock = new zmq.Subscriber

  const xcpClient = jayson.client.http(UNOPARTY_URL)

  const sleep = (ms) => new Promise(r => setTimeout(r, ms))

  const waitForCounterpartyBlock = (blockhash) => async () => {
    let found = false
    let xcpInfo
    while (!found) {
      xcpInfo = await xcpClient.request('get_running_info', [])
      if (xcpInfo.result && xcpInfo.result.last_block && xcpInfo.result.last_block.block_hash === blockhash) {
        found = true
      } else {
        await sleep(INTERVAL_CHECK_COUNTERPARTY_PARSED)
      }
    }

    let blocks = await xcpClient.request('get_blocks', {block_indexes: [xcpInfo.result.last_block.block_index]})

    notifiers.xcp(blocks.result[0]._messages.map(x => {
      try {
        return {
          ...x,
          bindings: JSON.parse(x.bindings)
        }
      } catch(e) {
        return x
      }
    }))
  }

  sock.connect(UNOBTANIUM_ZMQ_URL)
  if (notifiers && notifiers.hashtx) {
    sock.subscribe('hashtx')
  }

  if (notifiers && notifiers.hashblock) {
    sock.subscribe('hashblock')
  }
  console.log(`ZMQ connected to ${UNOBTANIUM_ZMQ_URL}`)

  for await (const [topic, msg] of sock) {
    const topicName = topic.toString('utf8')

    if (topicName === 'hashtx') {
      const txid = msg.toString('hex')
      notifiers.hashtx(txid)
    } else if (topicName === 'hashblock') {
      const blockhash = msg.toString('hex')
      notifiers.hashblock(blockhash)
      if (notifiers.xcp) {
        setTimeout(waitForCounterpartyBlock(blockhash), INTERVAL_CHECK_UNOPARTY_PARSED)
      }
    }
  }
}

function startServer() {
  const app = express()
  const redisClient = redis.createClient(REDIS_URL)
  const RedisStore = require('connect-redis')(session)
  //const server = http.createServer(app)
  const wsInstance = expressWs(app)
  if (process.env.HELMET_ON) {
    app.use(helmet()) // Protect headers
  }
  app.use(cors()) // Allow cors
  app.use(
    session({
      store: new RedisStore({ client: redisClient }),
      secret: SESSION_SECRET,
      resave: false,
    })
  )
  app.use(express.static('static'))

  app.get('/api', (req, res) => {
    res.json({})
  })

  const notificationObservers = {
    hashtx: [],
    hashblock: [],
    xcp: []
  }
  const notifiers = {
    hashtx: (data) => {
      notificationObservers.hashtx.forEach(x => x(data))
    },
    hashblock: (data) => {
      notificationObservers.hashblock.forEach(x => x(data))
    },
    xcp: (data) => {
      notificationObservers.xcp.forEach(x => x(data))
    }
  }
  //const wss = new WebSocket.Server({ clientTracking: false, noServer: true })
  //server.on('upgrade', function (request, socket, head) {

    /*sessionParser(request, {}, () => {
      // Use this code to allow only api calls that are authed
      if (!request.session.userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      console.log('Session is parsed!');

      wss.handleUpgrade(request, socket, head, function (ws) {
        wss.emit('connection', ws, request);
      });
    });*/

  /*  console.log('User asking upgrade to websocket')
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })

  })*/

  let globalId = 0
  //const clients = {}
  app.ws('/', (ws, request) => {
    const myId = globalId++
    console.log(`User ${myId} connected`)
    //const userId = request.session.userId;
    //clients[myId] = ws

    ws.on('message', (message) => {
      // no need for these rn
    })

    ws.on('close', () => {
      //delete clients[myId]
    })
  })

  const broadcast = (msg) => {
    wsInstance.getWss().clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    })
  }

  notificationObservers.hashblock.push((data) => {
    broadcast(JSON.stringify({ hashblock: data }))
  })

  notificationObservers.hashtx.push((data) => {
    broadcast(JSON.stringify({ hashtx: data }))
  })

  notificationObservers.xcp.push((data) => {
    broadcast(JSON.stringify({ xcp: data }))
  })

  //server.listen(HTTP_PORT, (err) => {
  app.listen(HTTP_PORT, (err) => {
    if (err) {
      console.log(`Error while listening on port ${HTTP_PORT}`, err)
    } else {
      console.log(`Listening on port ${HTTP_PORT}`)

      setImmediate(() => startZmq(notifiers))
    }
  })

  if (SESSION_SECRET === DEFAULT_SESSION_SECRET) {
    console.error(`Using default session secret "${DEFAULT_SESSION_SECRET}", This is very dangerous: pass SESSION_SECRET environment variable to modify it`)
  }
}

// Yargs has built in mechanism to handle commands, but it isn't working here
const {argv} = yargs(yargs.hideBin(process.argv))
if (argv._.length > 0 && argv._[0] === 'server') {
  startServer()
}
