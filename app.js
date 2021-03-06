/**
 * rewebrtc-server project
 *
 * Tho Q Luong <thoqbk@gmail.com>
 * Feb 12, 2017
 */

var express = require('express');
var app = express();
var path = require('path');
var fs = require('fs');
var open = require('open');
var httpsOptions = {
  key: fs.readFileSync('./fake-keys/privatekey.pem'),
  cert: fs.readFileSync('./fake-keys/certificate.pem')
};
let isLocal = process.env.PORT == null;
var serverPort = (process.env.PORT || 4443);
var server = null;
if (isLocal) {
  server = require('https').createServer(httpsOptions, app);
} else {
  server = require('http').createServer(app);
}
var io = require('socket.io')(server);

let socketIdToNames = {};
//------------------------------------------------------------------------------
//  Serving static files
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/draw', function (req, res) {
  res.sendFile(__dirname + '/draw.html');
});

app.use('/style', express.static(path.join(__dirname, 'style')));
app.use('/script', express.static(path.join(__dirname, 'script')));
app.use('/image', express.static(path.join(__dirname, 'image')));

server.listen(serverPort, function () {
  // console.log('Rewebrtc-server is up and running at %s port', serverPort);
  if (isLocal) {
    open('http://localhost:' + serverPort)
  }
});

//------------------------------------------------------------------------------
//  WebRTC Signaling
function socketIdsInRoom(roomId) {
  var socketIds = io.nsps['/'].adapter.rooms[roomId];
  if (socketIds) {
    var collection = [];
    for (var key in socketIds) {
      collection.push(key);
    }
    return collection;
  } else {
    return [];
  }
}

function getRoomConnections(roomId) {
  var socketIds = io.nsps['/'].adapter.rooms[roomId];
  return socketIds;
}

function getSocketIdByUsername(u) {
  if (!u) {
    return;
  }

  var socketId = null;
  var counter = 0;
  for (var sockId in socketIdToNames) {
    if (socketIdToNames.hasOwnProperty(sockId)) {
      const uName = socketIdToNames[sockId];
      if (uName == u) {
        counter++;
        socketId = sockId;
      }
    }
  }
  // console.log('=======\n\n\n\n' + counter + '\n\n\n\n=============');
  return socketId;
}

io.on('connection', function (socket) {
  console.log('Connection');
  socket.on('disconnect', function () {
    console.log('Disconnect');
    delete socketIdToNames[socket.id];
    if (socket.room) {
      var room = socket.room;
      io.to(room).emit('leave', socket.id);
      socket.leave(room);
    }
  });

  /**
   * Callback: list of {socketId, name: name of user}
   */
  socket.on('join', function (joinData, callback) { //Join room
    let roomId = joinData.roomId;
    let name = joinData.name;
    socket.join(roomId);
    socket.room = roomId;
    socketIdToNames[socket.id] = name;
    var socketIds = socketIdsInRoom(roomId);
    let friends = socketIds.map((socketId) => {
      return {
        socketId: socketId,
        name: socketIdToNames[socketId]
      }
    }).filter((friend) => friend.socketId != socket.id);
    callback(friends);
    //broadcast
    friends.forEach((friend) => {
      io.sockets.connected[friend.socketId].emit("join", {
        socketId: socket.id, name
      });
    });
    console.log('Join: ', joinData);
  });

  socket.on('exchange', function (data) {
    console.log('exchange', data);
    data.from = socket.id;
    var to = io.sockets.connected[data.to];
    to.emit('exchange', data);
  });

  socket.on("count", function (roomId, callback) {
    var socketIds = socketIdsInRoom(roomId);
    callback(socketIds.length);
  });

  socket.on('video_call', function (data) {
    const toSocketId = getSocketIdByUsername(data.username),
      to = io.sockets.connected[toSocketId];
    to.emit('video_call', { 'username': data.username });
  });

  socket.on('outgoing_call', function (data) {
    const toSocketId = getSocketIdByUsername(data.to),
      to = io.sockets.connected[toSocketId];
    if (toSocketId) {
      to.emit('incoming_call', data);
    }
  });

  socket.on('drop_call', function (data) {
    const toSocketId = getSocketIdByUsername(data.callee),
      to = io.sockets.connected[toSocketId];
    if (toSocketId) {
      to.emit('participant_dropped_call');
    }
  });
});