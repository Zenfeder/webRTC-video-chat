(function() {
  var boxMe = document.getElementById('box-me');
  var boxInvite = document.getElementById('box-invite');
  var inputMe = document.getElementById('input-me');
  var inputReceiver = document.getElementById('input-receiver');
  var btnConfirm = document.getElementById('btn-confirm');
  var btnInvite = document.getElementById('btn-invite');
  var btnAcceptInvitation = document.getElementById('btn-accept');
  var btnRejectInvitation = document.getElementById('btn-reject');
  // 我的信息（别忘了我有可能是发送者，也可能是接收者）
  var myInfo = { nickname: '', socketId: '' };
  // 接收者的信息
  var receiverInfo = { nickname: '', socketId: '' };
  // 发送者的信息
  var senderInfo = { nickname: '', socketId: '' };
  

  var socket = io();

  // 用户给自己取昵称了
  btnConfirm.addEventListener('click', function(event) {
    var nickname = inputMe.value.trim();
    if (!nickname) {
      alert('请输入你的昵称');
      return;
    }
    
    socket.emit('create own nickname', nickname);
  });

  // 根据昵称邀请对方进行视频通话
  btnInvite.addEventListener('click', function(event) {
    var receiverName = inputReceiver.value.trim();
    if (!myInfo.nickname) {
      alert('请先输入你的昵称');
      return;
    }
    if (!receiverName) {
      alert('请输入对方的昵称');
      return;
    }

    if (receiverName === myInfo.nickname) {
      alert('不能跟自己聊天');
      return;
    }
    
    socket.emit('send a invitation', receiverName);
  });

  socket.on('create own nickname success', function(nickname) {
    boxMe.innerHTML = `创建成功，你的昵称为：<span style="color:red">${nickname}</span>`;
    myInfo.nickname = nickname;
    myInfo.socketId = socket.id;
  });
  socket.on('create own nickname error', function(nickname) {
    var elemTips = document.createElement('p');
    elemTips.style.color = 'red';
    elemTips.innerHTML = `创建失败，昵称 <span style="font-weight:600">${nickname}</span> 已被占用`;
    boxMe.appendChild(elemTips);
    inputMe.value = '';
    btnConfirm.setAttribute('disabled', true);
    setTimeout(() => {
      boxMe.removeChild(elemTips);
      btnConfirm.removeAttribute('disabled');
    }, 2000);
  });

  socket.on('invitation send success', function(receiver) {
    var elemSenderHandle = document.getElementById('box-video-sender-handle');
    document.getElementById('invite-form').style.display = 'none';
    elemSenderHandle.style.color = 'green';
    elemSenderHandle.innerHTML = '邀请发起成功，正在等待对方接听...';
    receiverInfo.nickname = receiver.nickname;
    receiverInfo.socketId = receiver.socketId;
  });
  socket.on('invitation send error', function(nickname) {
    var elemTips = document.createElement('p');
    elemTips.style.color = 'red';
    elemTips.innerHTML = `邀请发起失败，用户 <span style="font-weight:600">${nickname}</span> 不存在`;
    boxInvite.appendChild(elemTips);
    setTimeout(() => {
      boxInvite.removeChild(elemTips);
    }, 2000);
  });

  socket.on('received an invitation', function(sender) {
    var elemReceiverHandle = document.getElementById('box-video-receiver-handle');
    var elemSenderMsg = document.getElementById('sender-msg');
    elemReceiverHandle.style.display = 'block';
    elemSenderMsg.innerHTML = `${sender.nickname} 邀请你视频聊天，是否接受？`;
    senderInfo.nickname = sender.nickname;
    senderInfo.socketId = sender.socketId;
  });
  
  // 接受视频邀请
  btnAcceptInvitation.addEventListener('click', function(event) {
    socket.emit('accept an invitation', { sender: senderInfo, receiver: myInfo });
    document.getElementById('box-video-receiver-handle').style.display = 'none';
  });
  // 拒绝视频邀请
  btnRejectInvitation.addEventListener('click', function(event) {
    socket.emit('reject an invitation', { sender: senderInfo, receiver: myInfo });
    document.getElementById('box-video-receiver-handle').style.display = 'none';
    senderInfo.nickname = '';
    senderInfo.socketId = '';
  });
  
  // 接收方（receiver）接受了你的视频通话邀请
  socket.on('receiver accepted your invitation', function(receiver) {
    var elemSenderHandle = document.getElementById('box-video-sender-handle');
    elemSenderHandle.style.color = 'green';
    elemSenderHandle.innerHTML = `${receiver.nickname} 接受了你的视频邀请`;

    // 开始处理视频信息...
    makeCall();
  });

  // 接收方（receiver）接受了你的视频通话邀请
  socket.on('receiver rejected your invitation', function(receiver) {
    var elemSenderHandle = document.getElementById('box-video-sender-handle');
    document.getElementById('invite-form').style.display = 'block';
    elemSenderHandle.style.color = 'red';
    elemSenderHandle.innerHTML = `${receiver.nickname} 拒绝了你的视频邀请`;
  });

  /**
   * webRTC 信令
   */

  //1. 建立（本地与远端之间的）对等连接（Initiating peer connections）
  const configuration = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]};
  // 发起方
  async function makeCall() {
    const peerConnection = new RTCPeerConnection(configuration);
    socket.on('message', async message => {
      if (message.answer) {
        console.log('发送方收到接收方的 answer：', message);
        const remoteDesc = new RTCSessionDescription(message.answer);
        await peerConnection.setRemoteDescription(remoteDesc);
      }
    });
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('message with offer', { 'receiver': receiverInfo, 'offer': offer });
  }

  // 接收方
  const peerConnection = new RTCPeerConnection(configuration);
  socket.on('message', async message => {
    if (message.offer) {
      peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log('接收方收到发送方的 offer：', message);
      socket.emit('message with answer', { 'sender': senderInfo, 'answer': answer });
    }
  });

  // 2. 收集与交换（本地与远端的）ICE 候选人（Trickle ICE）
  // 在本地 RTCPeerConnection 上监听本地 ICE 候选人，并通过websocket建立的信道把 ICE 候选人发送给远端（receiver）
  peerConnection.onicecandidate = function(event) {
    console.log('local icecandidate');
    if (event.candidate) {
      socket.emit('new-ice-candidate', { 'receiver': receiverInfo, 'candidate': event.candidate });
    }
  };

  // 监听远端（receiver）通过 websocket 信道发送过来的 ICE 候选人，并将它们添加到本地 RTCPeerConnection
  socket.on('message', async function(message) {
    if (message.iceCandidate) {
      try {
        await peerConnection.addIceCandidate(message.iceCandidate);
      } catch (e) {
        console.error('添加已收到的 ice candidate 的过程中出了点问题', e);
      }
    }
  });
})();