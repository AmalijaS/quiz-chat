const socket = io();

// DOM элементы
const modal = document.getElementById('login-modal');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username');
const errorMsgSpan = document.getElementById('error-msg');

const gameStatus = document.getElementById('game-status');
const questionArea = document.getElementById('question-area');
const questionText = document.getElementById('question-text');
const optionsDiv = document.getElementById('options');
const feedbackP = document.getElementById('feedback');
const playersList = document.getElementById('players-list');
const newGameBtn = document.getElementById('new-game-btn');

let currentUserName = null;

// ---------- Вход ----------
joinBtn.onclick = () => {
  const name = usernameInput.value.trim();
  if (!name) {
    errorMsgSpan.textContent = 'Введите имя';
    return;
  }
  socket.emit('set_name', name, (success, msg) => {
    if (success) {
      currentUserName = name;
      modal.style.display = 'none';
      gameStatus.textContent = 'Игра началась!';
    } else {
      errorMsgSpan.textContent = msg;
    }
  });
};

// ---------- Новая игра ----------
newGameBtn.onclick = () => {
  socket.emit('new_game');
};

// ---------- События Socket.IO ----------
socket.on('new_question', (data) => {
  gameStatus.textContent = `Вопрос ${data.questionNumber} из ${data.total}`;
  questionArea.style.display = 'block';
  questionText.textContent = data.questionText;
  optionsDiv.innerHTML = '';
  data.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = `${idx+1}. ${opt}`;
    btn.onclick = () => {
      socket.emit('answer', idx);
      document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
      feedbackP.textContent = 'Ответ отправлен...';
    };
    optionsDiv.appendChild(btn);
  });
  feedbackP.textContent = '';
  newGameBtn.style.display = 'none'; // скрываем кнопку во время игры
});

socket.on('correct_answer', (msg) => {
  feedbackP.innerHTML = `<span style="color:lightgreen">${msg}</span>`;
});
socket.on('wrong_answer', (msg) => {
  feedbackP.innerHTML = `<span style="color:salmon">${msg}</span>`;
});
socket.on('error_msg', (msg) => {
  feedbackP.innerHTML = `<span style="color:orange">${msg}</span>`;
});
socket.on('timeout', (msg) => {
  feedbackP.innerHTML = `<span style="color:orange">⏰ ${msg}</span>`;
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
});

socket.on('users_list', (users) => {
  playersList.innerHTML = '';
  users.sort((a,b) => b.score - a.score);
  users.forEach(u => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${escapeHtml(u.name)}</strong> — ${u.score} очков`;
    playersList.appendChild(li);
  });
});

socket.on('game_over', ({ winner, finalScores }) => {
  gameStatus.textContent = `🏆 Игра окончена! Победитель: ${winner}`;
  questionArea.style.display = 'none';
  newGameBtn.style.display = 'block';
  // Показываем финальные результаты в алерте
  let finalMsg = 'Финальные результаты:\n';
  for (let id in finalScores) {
    finalMsg += `${finalScores[id].name}: ${finalScores[id].score}\n`;
  }
  alert(finalMsg);
});

// Обновление игры после нажатия "Новая игра"
socket.on('game_reset', () => {
  gameStatus.textContent = 'Игра перезапущена! Новый раунд.';
  questionArea.style.display = 'block';
  feedbackP.innerHTML = '';
  newGameBtn.style.display = 'none';
});

function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}