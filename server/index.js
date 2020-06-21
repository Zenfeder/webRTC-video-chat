const express = require('express');
const app = express();
const path = require('path');
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = 3001;
const publicPath = express.static(path.join(__dirname, '../public'));

app.use('/', publicPath);

app.get('/', (req, res) => {
  res.sendFile(publicPath + '/index.html');
});


// 给自己取了昵称的 socket 队列
const namedSocketQueue = [];

io.on('connection', socket => {
  console.log(`user (${socket.id}) connected`);

  // 用户给自己取了昵称
  socket.on('create own nickname', nickname => {
    if (namedSocketQueue.every(elem => elem.nickname !== nickname)) {
      console.log(`user (${socket.id}) create own nickname: ${nickname}`);
      namedSocketQueue.push({ nickname, socketId: socket.id });
      socket.emit('create own nickname success', nickname);
    } else {
      socket.emit('create own nickname error', nickname);
    }
  });

  // 用户根据昵称邀请对方进行视频通话
  socket.on('send a invitation', nickname => {
    console.log(`user (${socket.id}) invite other by nickname: ${nickname}`);
    var sender = namedSocketQueue.find(elem => elem.socketId === socket.id);
    var receiver = namedSocketQueue.find(elem => elem.nickname === nickname);
    if (receiver) {
      socket.emit('invitation send success', receiver);
      // 通知接收方（receiver），有人（sender）邀请他进行视频通话
      io.to(receiver.socketId).emit('received an invitation', sender);
    } else {
      socket.emit('invitation send error', nickname);
    }
  });

  // 接收方（receiver）接受了发起方（sender）的视频邀请
  socket.on('accept an invitation', ({ sender, receiver }) => {
    console.log(`${receiver.nickname} 接收了 ${sender.nickname} 的视频邀请`);
    // 通知发起方（sender），对方（receiver）接受了他的视频通话邀请
    io.to(sender.socketId).emit('receiver accepted your invitation', receiver);
  });

  // 接收方（receiver）接受了发起方（sender）的视频邀请
  socket.on('reject an invitation', ({ sender, receiver }) => {
    console.log(`${receiver.nickname} 拒绝了 ${sender.nickname} 的视频邀请`);
    // 通知发起方（sender），对方（receiver）拒绝了他的视频通话邀请
    io.to(sender.socketId).emit('receiver rejected your invitation', receiver);
  });

  /**
   * webRTC 信令
   */

  // 1. 建立对等链接（Initiating peer connections）

  // 对等链接信令的发起者发来的消息，需要传递给对等链接的接收者（receiver）
  socket.on('message with offer', ({ receiver, offer }) => {
    console.log(`发起者起对等链接，接收者为 ${receiver.nickname}, ${receiver.socketId}`);
    io.to(receiver.socketId).emit('message', { offer });
  });
 
  // 对等链接信令的接收者发来的消息，需要传递给对等链接的发起者（sender）
  socket.on('message with answer', ({ sender, answer }) => {
    console.log(`接收者回复对等链接请求，发起者为 ${sender.nickname}, ${sender.socketId}`);
    io.to(sender.socketId).emit('message', { answer });
  });

  // 2. 交换（本地与远端的）ICE 候选人（Trickle ICE）
  socket.on('new-ice-candidate', ({ receiver, candidate }) => {
    console.log(`Trickle ICE，receiver: ${receiver.nickname}`);
    io.to(receiver.socketId).emit('message', { iceCandidate: candidate });
  });

  socket.on('disconnect', () => {
    console.log(`user (${socket.id}) disconnected`);
  });
});


http.listen(port, () => {
  console.log(`Listening on port ${port}`)
});


