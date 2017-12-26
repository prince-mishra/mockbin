'use strict'

var compression = require('compression')
var cookieParser = require('cookie-parser')
var debug = require('debug-log')('mockbin')
var express = require('express')
var methodOverride = require('method-override')
var morgan = require('morgan')
var path = require('path')
var router = require('../lib')
var redis = require('redis')
//
var http = require('http');
var url = require('url');
var WebSocket = require('ws');


module.exports = function (options, done) {
  if (!options) {
    throw Error('missing options')
  }

  debug('system started with options: %j', options)

  // setup ExpressJS
  var app = express()

  app.enable('view cache')
  app.enable('trust proxy')
  app.set('view engine', 'jade')
  app.set('views', path.join(__dirname, 'views'))
  app.set('jsonp callback name', '__callback')

  // add 3rd party middlewares
  app.use(compression())
  app.use(cookieParser())
  app.use(methodOverride('__method'))
  app.use(methodOverride('X-HTTP-Method-Override'))
  app.use('/static', express.static(path.join(__dirname, 'static')))

  if (options.quiet !== true) {
    app.use(morgan('dev'))
  }

  // magic starts here
  app.use('/', router(options))

  var sendChunk = function(conn, collection, idx) {
    if ((conn.stopSending == true) || (idx >= collection.length )) {
      conn.close();
      return;
    }
    conn.send(collection[idx]);
    setTimeout(function() {
      sendChunk(conn, collection, idx+1)
    }, 1000);
  }

  var wsConnectionHandler = function (ws) {
    var uuid = ws.uuid;
    ws.on('message', function incoming(message) {
      console.log('Message Received: %s on conn %s', message, uuid);
      ws.send(message);
    });
    ws.on('close', function (e) {
      ws.stopSending = true;
    });


    ws.redisClient.get('wsbin:' + uuid, function (err, value) {
      if (err) {
        debug(err)
        ws.close();
      }

      if (value) {
        var $obj = JSON.parse(value);
        var contents = $obj.content.text.split('\n');
        var idx = 0;
        sendChunk(ws, contents, idx);
      }
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  var dsn = url.parse(options.redis);

  wss.redisClient = redis.createClient(dsn.port, dsn.hostname, {
    auth_pass: dsn.auth ? dsn.auth.split(':').pop() : false
  })

  wss.redisClient.on('error', function (err) {
    debug('redis error:', err)
  })


  wss.on('connection', function connection(ws, req) {
    const location = url.parse(req.url, true);
    var path = location.path;
    var uuid = path.replace(/\//g, '').replace(/wsbin/g,'');

    ws.uuid = uuid;
    ws.redisClient = wss.redisClient;
    ws.stopSending = false;
    wsConnectionHandler(ws);
    // You might use location.query.access_token to authenticate or share sessions
    // or req.headers.cookie (see http://stackoverflow.com/a/16395220/151312)
  });

  server.listen(options.port, function listening() {
    console.log('Websocket server listening on %d', server.address().port);
  });

  if (typeof done === 'function') {
    done()
  }
}
