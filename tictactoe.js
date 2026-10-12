(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const STORAGE = "game_room_tictactoe_v1";
  const ROOM_TAB = "game_room_active_tab";
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const LEVELS = ["easy","normal","hard"];
  const BUTTONS = Array.from(document.querySelectorAll(".ttt-cell"));
  const TABS = Array.from(document.querySelectorAll(".game-tab"));
  const DEFAULT_DURAK_RULES = $("game-rules").innerHTML;
  const TTT_RULES = "<b>Правила:</b> Ти ставиш хрестики (✕), суперниця — нулики (◯). Три однакові символи в ряд — перемога. Складність: легка, звичайна або безжальна. Гардероб спільний з «Дурнем».";
  const CLOTHES = ["шарф","жакет","спідницю","блузу","легінси"];
  let state = {wins:0, losses:0, draws:0, level:"normal"};
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    if (saved && typeof saved === "object") {
      for (const key of ["wins","losses","draws"]) if (Number.isSafeInteger(saved[key]) && saved[key] >= 0) state[key] = saved[key];
      if (LEVELS.includes(saved.level)) state.level = saved.level;
    }
  } catch (_) {}

  let board = Array(9).fill(null);
  let turn = "X", outcome = null, winningLine = [];
  let round = 0, generation = 0, opponentTimer = null, selectedMode = "durak";
  const random = items => items[Math.floor(Math.random() * items.length)];

  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch (_) {}
  }

  function winnerOf(cells) {
    for (const combo of LINES) if (cells[combo[0]] && combo.every(i => cells[i] === cells[combo[0]])) {
      return { winner: cells[combo[0]], line: combo };
    }
    if (cells.every(Boolean)) return { winner: "draw", line: [] };
    return null;
  }

  function minimax(cells, player, depth = 0) {
    const result = winnerOf(cells);
    if (result) {
      if (result.winner === "O") return 10 - depth;
      if (result.winner === "X") return depth - 10;
      return 0;
    }
    if (player === "O") {
      let value = -Infinity;
      for (let i = 0; i < 9; i++) if (!cells[i]) {
        cells[i] = "O";
        value = Math.max(value, minimax(cells, "X", depth + 1));
        cells[i] = null;
      }
      return value;
    }
    let value = Infinity;
    for (let i = 0; i < 9; i++) if (!cells[i]) {
      cells[i] = "X";
      value = Math.min(value, minimax(cells, "O", depth + 1));
      cells[i] = null;
    }
    return value;
  }

  function chooseMove() {
    const empty = board.map((c, i) => c ? -1 : i).filter(i => i >= 0);
    if (!empty.length) return -1;
    const winning = empty.filter(i => {
      const snapshot = board.slice(); snapshot[i] = "O";
      return winnerOf(snapshot)?.winner === "O";
    });
    if (winning.length) return random(winning);
    const p = state.level === "hard" ? 1 : state.level === "normal" ? .78 : .28;
    if (Math.random() > p) return random(empty);
    const scored = empty.map(i => {
      board[i] = "O";
      const score = minimax(board, "X", 1);
      board[i] = null;
      return {i,score};
    });
    const high = Math.max(...scored.map(x => x.score));
    const best = scored.filter(x => x.score === high).map(x => x.i);
    return random(best);
  }

  function setMood(message) {
    const speaker = window.CardDuelRoom?.speak;
    if (typeof speaker === "function") speaker(message);
    else $("bubble").textContent = message;
  }

  function showScore() {
    $("ttt-wins").textContent = state.wins;
    $("ttt-losses").textContent = state.losses;
    $("ttt-draws").textContent = state.draws;
  }

  function updateOutfit(result) {
    if (result === "draw") return "Гардероб без змін.";
    const method = window.CardDuelRoom?.adjustOutfit;
    if (typeof method !== "function") return "Гардероб не оновлено.";
    const update = method(result === "X" ? "win" : "lose");
    if (!update?.changed) return result === "X"
      ? "Максимальний рівень. Базове закрите вбрання залишається."
      : "Увесь одяг уже на місці.";
    return result === "X" ? "Знято: " + CLOTHES[update.previous] + "."
      : "Повернуто: " + CLOTHES[update.current] + ".";
  }

  function paint() {
    const finished = outcome !== null;
    for (let i = 0; i < 9; i++) {
      const cell = BUTTONS[i];
      const value = board[i];
      const onLine = winningLine.includes(i);
      cell.textContent = value === "X" ? "✕" : value === "O" ? "◯" : "";
      cell.disabled = finished || turn !== "X" || !!value;
      cell.classList.toggle("mark-x",value === "X");
      cell.classList.toggle("mark-o",value === "O");
      cell.classList.toggle("winning",onLine);
      cell.setAttribute("aria-label","Клітинка "+(i + 1)+(value ? (value === "X" ? ", хрестик" : ", нулик") : ", порожня"));
    }
    $("ttt-status").innerHTML = finished
      ? outcome === "X" ? '<span class="ttt-win-icon">✦</span> Твоя перемога!'
      : outcome === "O" ? '<span class="ttt-win-icon">◯</span> Перемога суперниці'
      : '<span class="ttt-win-icon">≡</span> Нічия'
      : turn === "X" ? '<span class="ttt-pulse"></span>Твій хід — обери клітинку ✕'
        : '<span class="ttt-pulse"></span>Суперниця думає… ◯';
    showScore();
  }

  function endRound(result) {
    if (outcome || !result) return;
    outcome = result.winner;
    winningLine = result.line;
    const clothing = updateOutfit(outcome);
    if (outcome === "X") {
      state.wins++;
      $("ttt-result").innerHTML = '<strong>🏆 Ти переміг!</strong><span>'+clothing+'</span>';
      setMood(random(["Зараховано! Але реванш я візьму. 😏","Три в ряд? Сильний хід!","Гаразд, цей раунд твій."]));
      window.CardDuelRoom?.beep?.(940);
    } else if (outcome === "O") {
      state.losses++;
      $("ttt-result").innerHTML = '<strong>◯ Цього разу перемогла я!</strong><span>'+clothing+'</span>';
      setMood(random(["Один нуль на мою користь. 😎","Не ображайся — я теж хочу вигравати!","Три в ряд. Ще партію?"]));
      window.CardDuelRoom?.beep?.(500);
    } else {
      state.draws++;
      $("ttt-result").innerHTML = '<strong>🤝 Нічия!</strong><span>'+clothing+'</span>';
      setMood(random(["Нічия. Визнаю, непогано!","Спробуємо знову?","Ну хоч у цьому ми рівні."]));
      window.CardDuelRoom?.beep?.(660);
    }
    $("ttt-result").hidden = false;
    $("ttt-reset").textContent = "↻ Зіграти ще";
    persist();
    paint();
  }

  function put(index, who) {
    if (outcome || turn !== who || board[index]) return;
    board[index] = who;
    window.CardDuelRoom?.beep?.(who === "X" ? 710 : 530);
    const result = winnerOf(board);
    if (result) {
      endRound(result);
      return;
    }
    turn = who === "X" ? "O" : "X";
    paint();
    if (turn === "O") {
      const token = generation;
      clearTimeout(opponentTimer);
      opponentTimer = setTimeout(() => {
        if (generation !== token || outcome || turn !== "O") return;
        const move = chooseMove();
        if (move >= 0) put(move,"O");
      }, 400);
    } else if (Math.random() < .33) {
      setMood(random(["Цікаво, як ти далі підеш?","Твій хід, стратег.","Спробуй не віддати мені кут. 😏"]));
    }
  }

  function nextRound() {
    clearTimeout(opponentTimer);
    generation++;
    round++;
    board = Array(9).fill(null);
    winningLine = [];
    outcome = null;
    turn = round % 2 === 1 ? "X" : "O"; // Чергування першого ходу
    $("ttt-result").hidden = true;
    $("ttt-result").innerHTML = "";
    $("ttt-reset").textContent = "↻ Нова гра";
    paint();
    if (turn === "O") {
      const token = generation;
      opponentTimer = setTimeout(() => {
        if (generation === token && turn === "O" && !outcome) put(chooseMove(),"O");
      }, 510);
    }
    if (selectedMode === "ttt") setMood(turn === "X"
      ? "Ходиш першим. Покажи, на що здатен! ✕"
      : "Цього разу я починаю. ◯");
  }

  function selectMode(next) {
    if (next !== "ttt" && next !== "durak") return;
    selectedMode = next;
    $("durak-screen").hidden = next !== "durak";
    $("ttt-screen").hidden = next !== "ttt";
    $("restart").hidden = next !== "durak";
    $("mode-name").textContent = next === "durak" ? "ПІДКИДНИЙ ДУРЕНЬ · 36 КАРТ" : "ХРЕСТИКИ-НУЛИКИ · 3 × 3";
    $("game-rules").innerHTML = next === "durak" ? DEFAULT_DURAK_RULES : TTT_RULES;
    for (const tab of TABS) {
      const on = tab.dataset.mode === next;
      tab.classList.toggle("active",on);
      tab.setAttribute("aria-selected",on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
    }
    if (next === "ttt") {
      if (!outcome) setMood(turn === "X" ? "Твій хід, став хрестик! ✕" : "Мій хід, хвилинку. ◯");
    } else {
      setMood("Повернулися до карт? Я готова. 🃏");
    }
    try { localStorage.setItem(ROOM_TAB, next); } catch (_) {}
  }

  BUTTONS.forEach((cell,i) => cell.addEventListener("click",() => put(i,"X")));
  $("ttt-reset").addEventListener("click", nextRound);
  $("ttt-difficulty").value = state.level;
  $("ttt-difficulty").addEventListener("change", event => {
    const newLevel = event.target.value;
    if (LEVELS.includes(newLevel)) {
      state.level = newLevel; persist();
      if (selectedMode === "ttt") setMood(newLevel === "hard"
        ? "Безжальний режим? Ну добре, сама напросилася! 😈"
        : newLevel === "easy" ? "Гаразд, буду грати спокійніше." : "Звичайний рівень. Хай переможе кмітливіший.");
    }
  });
  TABS.forEach(tab => {
    tab.addEventListener("click", () => selectMode(tab.dataset.mode));
    tab.addEventListener("keydown", e => {
      if (!["ArrowLeft","ArrowRight","Home","End"].includes(e.key)) return;
      e.preventDefault();
      const target = e.key === "Home" ? 0 : e.key === "End" ? TABS.length-1
        : (TABS.indexOf(tab)+(e.key === "ArrowRight" ? 1 : TABS.length-1))%TABS.length;
      TABS[target].focus(); selectMode(TABS[target].dataset.mode);
    });
  });

  nextRound();
  let preferred = "durak";
  try { preferred = localStorage.getItem(ROOM_TAB) === "ttt" ? "ttt" : "durak"; } catch (_) {}
  selectMode(preferred);
})();