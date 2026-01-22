// server.js
import express from 'express';
import {createServer} from 'http';
import {Server} from 'socket.io';
import{ v4 as uuidv4 } from'uuid';

const app = express();
const server =  createServer(app);


const io = new Server(server, {
  cors: {
    origin: "*", // разрешить всем (для теста)
    methods: ["GET", "POST"]
  }
});
// Храним пользователей: socket.id -> { id, nickname, color }
const users = {};

// Генерация случайного цвета в формате #RRGGBB
function getColorForNickname(nickname) {
  // Простой хеш от строки
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Генерация цвета: HSL для ярких, но приятных оттенков
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

function updateUserCount() {
  io.emit('user count', Object.keys(users).length);
}


app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('Новый пользователь подключился:', socket.id);

  updateUserCount(); // при подключении

  // Событие: пользователь вводит никнейм
  socket.on('set nickname', (nickname) => {
    const color = getColorForNickname(nickname);
    users[socket.id] = { id: uuidv4(), nickname, color };

    // Уведомляем всех о новом пользователе
    socket.broadcast.emit('user joined', {
      nickname,
      color,
    });

    // Отправляем пользователю его данные
    socket.emit('self info', { nickname, color });
  });

  // Событие: получение сообщения
  socket.on('send message', (text) => {
    const user = users[socket.id];
    if (!user) return;

    const message = {
      text,
      author: user.nickname,
      color: user.color,
      timestamp: new Date().toLocaleTimeString(),
    };

    // Рассылаем сообщение всем, включая отправителя
    io.emit('new message', message);
  });

  // Пользователь отключился
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      socket.broadcast.emit('user left', { nickname: user.nickname });
      delete users[socket.id];
    }
    console.log('Пользователь отключился:', socket.id);
    updateUserCount(); // при отключении
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
