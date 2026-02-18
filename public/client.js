// public/client.js

// Глобальные переменные
let currentUser = null;
let typingTimeout;

// Подключаемся к серверу
const socket = io();

// Элементы DOM
const nicknameForm = document.getElementById('nickname-form');
const nicknameInput = document.getElementById('nickname-input');
const chatContainer = document.getElementById('chat-container');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
// Убираем onclick из HTML
document.getElementById('join-btn').addEventListener('click', setNickname);
document.getElementById('send-btn').addEventListener('click', sendMessage);

// Или через delegation, если нужно

// === Функции ===

function setNickname() {
  const nickname = nicknameInput.value.trim();

  if (!nickname) {
    alert('Никнейм не может быть пустым!');
    return;
  }

  if (nickname.length < 2) {
    alert('Никнейм должен быть не менее 2 символов!');
    return;
  }

  if (nickname.length > 16) {
    alert('Никнейм слишком длинный (макс. 16 символов)');
    return;
  }

  socket.emit('set nickname', nickname);
  nicknameForm.style.display = 'none';
  chatContainer.style.display = 'flex';
}

function addMessage(message) {
  const isSelf = message.author === currentUser?.nickname;
  const messageElement = document.createElement('div');
  messageElement.className = `message ${isSelf ? 'self' : 'other'}`;
  messageElement.style.borderLeft = `4px solid ${message.color}`;
  messageElement.innerHTML = `
    <span class="author" style="color: ${message.color}">${message.author}</span>
    <span class="text">${message.text}</span>
    <span class="timestamp">${message.timestamp}</span>
  `;
  messages.appendChild(messageElement);
  scrollToBottom();
}

function addSystemMessage(text) {
  const el = document.createElement('div');
  el.style.color = '#666';
  el.style.fontStyle = 'italic';
  el.style.textAlign = 'center';
  el.style.fontSize = '0.9em';
  el.style.margin = '10px 0';
  el.textContent = text;
  messages.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

// === Обработчики событий с сервера ===

socket.on('self info', (data) => {
  currentUser = data;
  addSystemMessage(`Добро пожаловать, ${data.nickname}!`);
});

socket.on('user count', (count) => {
  const text = count === 1 ? 'человек' : count < 5 ? 'человека' : 'человек';
  document.getElementById('user-count').textContent = `${count} ${text}`;
});


socket.on('new message', (message) => {
  addMessage(message);
});

socket.on('message history', (history) => {
  history.forEach(addMessage);
});

socket.on('user joined', (data) => {
  addSystemMessage(`${data.nickname} присоединился к чату.`);
});

socket.on('user left', (data) => {
  addSystemMessage(`${data.nickname} покинул чат.`);
});

socket.on('user typing', (nickname) => {
  const typingEl = document.getElementById('typing') || document.createElement('div');
  typingEl.id = 'typing';
  typingEl.style.color = '#888';
  typingEl.style.fontSize = '0.9em';
  typingEl.textContent = `${nickname} печатает...`;

  messages.appendChild(typingEl);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (typingEl.parentNode) {
      typingEl.parentNode.removeChild(typingEl);
    }
  }, 1500);
});

// === Взаимодействие с интерфейсом ===

function sendMessage() {
  const text = messageInput.value.trim();
  if (text) {
    socket.emit('send message', text);
    messageInput.value = '';
    // Опционально: отправить событие "перестал печатать"
    socket.emit('stop typing', currentUser.nickname);
  }
}

// Отправка по Enter
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Событие при вводе — показываем "печатает..."
messageInput.addEventListener('input', () => {
  if (currentUser) {
    socket.emit('typing', currentUser.nickname);
  }
});
// === ВИДЕОЧАТ ===
let localStream;
let peerConnection;
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const callBtn = document.getElementById('call-btn');

// STUN-серверы (помогают найти путь через интернет)
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

// Запуск видеозвонка
async function startCall() {
  try {
    // 1. Получаем доступ к камере и микрофону
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    // 2. Создаём соединение
    peerConnection = new RTCPeerConnection(configuration);

    // Добавляем свои треки
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // 3. При получении кандидата — отправляем через сокет
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', event.candidate);
      }
    };

    // 4. Когда приходит удалённый поток — показываем
    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
    };

    // 5. Создаём offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);

    callBtn.disabled = true;
    callBtn.textContent = 'Звонок активен...';
  } catch (err) {
    console.error('Ошибка при звонке:', err);
    alert('Не удалось получить доступ к камере или микрофону');
  }
}

// Обработка входящего offer
socket.on('offer', async (offer) => {
  if (!peerConnection) {
    await startCall(); // Инициализируем ответ
  }

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', answer);
});

// Обработка ответа
socket.on('answer', async (answer) => {
  if (peerConnection) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }
});

// Обработка ICE-кандидатов
socket.on('ice-candidate', (candidate) => {
  if (peerConnection) {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

// Кнопка "Позвонить"
callBtn.addEventListener('click', () => {
  if (!peerConnection) {
    startCall();
  }
});

