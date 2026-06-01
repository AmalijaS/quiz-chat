const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send('Добро пожаловать! Перейдите на <a href="/quiz">/quiz</a> для викторины');
});

app.get('/quiz', (req, res) => {
  res.render('quiz');
});

// ----- База вопросов -----
const questions = [
  { text: 'Столица Франции?', options: ['Берлин', 'Мадрид', 'Париж', 'Лиссабон'], correct: 2 },
  { text: 'Что используется для создания стилей веб-страниц?', options: ['HTML', 'CSS', 'JavaScript', 'Python'], correct: 1 },
  { text: 'Сколько планет в Солнечной системе (считая классические)?', options: ['7', '8', '9', '10'], correct: 1 },
  { text: 'Что означает аббревиатура HTTP?', options: ['HyperText Transfer Protocol', 'High Transfer Text Protocol', 'Hyper Transfer Text Protocol', 'HyperText Transmission Protocol'], correct: 0 }
];

let currentQuestionIndex = 0;
let users = {};      
let gameActive = false;
let nextQuestionTimeout = null;
let gameStarted = false;

function sendQuestion() {
  if (currentQuestionIndex >= questions.length) {
    const winner = Object.values(users).reduce((best, u) => u.score > best.score ? u : best, { score: -1, name: 'никто' });
    io.emit('game_over', { winner: winner.name, finalScores: users });
    gameActive = false;
    gameStarted = false;
    return;
  }
  const q = questions[currentQuestionIndex];
  io.emit('new_question', {
    questionText: q.text,
    options: q.options,
    questionNumber: currentQuestionIndex + 1,
    total: questions.length
  });
  gameActive = true;
  for (let id in users) users[id].answered = false;
  if (nextQuestionTimeout) clearTimeout(nextQuestionTimeout);
  nextQuestionTimeout = setTimeout(() => {
    if (gameActive) {
      io.emit('timeout', 'Время на ответ истекло!');
      currentQuestionIndex++;
      sendQuestion();
    }
  }, 20000);
}

function resetAndStartNewGame() {
  if (nextQuestionTimeout) clearTimeout(nextQuestionTimeout);
  currentQuestionIndex = 0;
  gameActive = false;
  gameStarted = true; 

  for (let id in users) {
    users[id].score = 0;
    users[id].answered = false;
  }
  io.emit('users_list', Object.values(users).map(u => ({ name: u.name, score: u.score })));
  io.emit('game_reset'); 
  sendQuestion(); 
}

function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  currentQuestionIndex = 0;
  for (let id in users) {
    users[id].score = 0;
    users[id].answered = false;
  }
  sendQuestion();
}

io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  socket.on('set_name', (name, callback) => {
    if (!name || name.trim() === '') {
      callback(false, 'Имя не может быть пустым');
      return;
    }
    const nameExists = Object.values(users).some(u => u.name === name);
    if (nameExists) {
      callback(false, 'Имя уже занято');
      return;
    }
    users[socket.id] = { name: name.trim(), score: 0, answered: false };
    callback(true);

    if (!gameStarted && Object.keys(users).length === 1) {
      startGame();
    } else if (gameActive && currentQuestionIndex < questions.length) {
      // Отправить новому игроку текущий вопрос
      const q = questions[currentQuestionIndex];
      socket.emit('new_question', {
        questionText: q.text,
        options: q.options,
        questionNumber: currentQuestionIndex + 1,
        total: questions.length
      });
    } else if (!gameActive && gameStarted) {
      socket.emit('game_over', { winner: '???', finalScores: users });
    }

    io.emit('users_list', Object.values(users).map(u => ({ name: u.name, score: u.score })));
  });

  socket.on('answer', (answerIndex) => {
    const user = users[socket.id];
    if (!user || user.answered || !gameActive) {
      socket.emit('error_msg', 'Вы уже отвечали или вопрос закрыт');
      return;
    }
    const q = questions[currentQuestionIndex];
    if (answerIndex === q.correct) {
      user.score += 10;
      socket.emit('correct_answer', '✅ Правильно! +10 очков');
      // Обновляем таблицу лидеров у всех
      io.emit('users_list', Object.values(users).map(u => ({ name: u.name, score: u.score })));
    } else {
      socket.emit('wrong_answer', `❌ Неверно! Правильный ответ: ${q.options[q.correct]}`);
    }
    user.answered = true;

    const allAnswered = Object.values(users).every(u => u.answered === true);
    if (allAnswered) {
      clearTimeout(nextQuestionTimeout);
      currentQuestionIndex++;
      sendQuestion();
    }
  });

  socket.on('new_game', () => {
    if (!gameStarted || !gameActive) { 
      resetAndStartNewGame();
    } else {
      socket.emit('error_msg', 'Игра уже идёт, дождитесь окончания');
    }
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      delete users[socket.id];
      io.emit('users_list', Object.values(users).map(u => ({ name: u.name, score: u.score })));
    }
    if (Object.keys(users).length === 0) {
      gameStarted = false;
      gameActive = false;
      if (nextQuestionTimeout) clearTimeout(nextQuestionTimeout);
    }
    console.log('Client disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});