const socket = io();
const boardElement = document.getElementById('game-board');
const p1ScoreEl = document.getElementById('p1-score');
const p2ScoreEl = document.getElementById('p2-score');
const statusEl = document.getElementById('status');
const roomIdEl = document.getElementById('room-id');
const overlay = document.getElementById('loading-overlay');
const overlayMsg = document.getElementById('overlay-msg');
const restartBtn = document.getElementById('restart-btn');

const DOTS = 6;
let SPACING = Math.min(window.innerWidth * 0.8, 400) / (DOTS - 1);
let myPlayerIndex = null;
let currentRoomId = null;
let lastGameState = null;

const lineElements = {};
const boxElements = {};

// Initialize room from URL or create new
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');

socket.emit('joinRoom', roomId);

socket.on('playerAssignment', (data) => {
    myPlayerIndex = data.playerIndex;
    currentRoomId = data.roomId;
    roomIdEl.innerText = currentRoomId;
    
    if (!roomId) {
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + currentRoomId;
        window.history.pushState({path:newUrl},'',newUrl);
    }
    
    document.getElementById('share-link-overlay').innerText = window.location.href;
    
    const p1Label = document.querySelector('#p1-box .p1-text');
    const p2Label = document.querySelector('#p2-box .p2-text');
    if (myPlayerIndex === 0) {
        p1Label.innerText = "P1 (You)";
        p2Label.innerText = "P2 (Opponent)";
    } else {
        p1Label.innerText = "P1 (Opponent)";
        p2Label.innerText = "P2 (You)";
    }
    
    initBoard();
});

socket.on('gameStateUpdate', (state) => {
    lastGameState = state;
    updateBoard(state);
    updateUI(state);
});

socket.on('playerLeft', () => {
    statusEl.innerText = "Opponent disconnected.";
    overlay.classList.remove('hidden');
    overlayMsg.innerText = "Opponent left the game.";
});

socket.on('error', (msg) => {
    alert(msg);
    window.location.href = '/';
});

function initBoard() {
    boardElement.innerHTML = '';
    boardElement.style.width = `${(DOTS - 1) * SPACING}px`;
    boardElement.style.height = `${(DOTS - 1) * SPACING}px`;

    // Boxes first (z-index 2)
    for (let r = 0; r < DOTS - 1; r++) {
        for (let c = 0; c < DOTS - 1; c++) {
            const el = document.createElement('div');
            el.className = 'box';
            el.style.top = `${r * SPACING}px`;
            el.style.left = `${c * SPACING}px`;
            el.style.width = `${SPACING}px`;
            el.style.height = `${SPACING}px`;
            boardElement.appendChild(el);
            boxElements[`${r}-${c}`] = el;
        }
    }

    // Lines (z-index 5)
    // Horizontal
    for (let r = 0; r < DOTS; r++) {
        for (let c = 0; c < DOTS - 1; c++) {
            createLineElement('h', r, c);
        }
    }
    // Vertical
    for (let r = 0; r < DOTS - 1; r++) {
        for (let c = 0; c < DOTS; c++) {
            createLineElement('v', r, c);
        }
    }

    // Dots (z-index 10)
    for (let r = 0; r < DOTS; r++) {
        for (let c = 0; c < DOTS; c++) {
            const dot = document.createElement('div');
            dot.className = 'dot';
            dot.style.top = `${r * SPACING}px`;
            dot.style.left = `${c * SPACING}px`;
            boardElement.appendChild(dot);
        }
    }
}

function createLineElement(type, r, c) {
    const line = document.createElement('div');
    const key = `${type}-${r}-${c}`;
    line.className = `line ${type === 'h' ? 'horizontal' : 'vertical'}`;
    
    if (type === 'h') {
        line.style.top = `${r * SPACING - 4}px`;
        line.style.left = `${c * SPACING + 4}px`;
        line.style.width = `${SPACING - 8}px`;
        line.style.height = `8px`;
    } else {
        line.style.top = `${r * SPACING + 4}px`;
        line.style.left = `${c * SPACING - 4}px`;
        line.style.width = `8px`;
        line.style.height = `${SPACING - 8}px`;
    }

    line.onclick = () => {
        if (lastGameState && lastGameState.status === 'playing' && 
            lastGameState.currentPlayer === myPlayerIndex && 
            lastGameState.lines[key] === undefined) {
            socket.emit('makeMove', { roomId: currentRoomId, move: { type, r, c } });
        }
    };
    
    boardElement.appendChild(line);
    lineElements[key] = line;
}

function updateBoard(state) {
    // Update lines
    for (const key in lineElements) {
        if (state.lines[key] !== undefined) {
            lineElements[key].classList.add('taken');
        } else {
            lineElements[key].classList.remove('taken');
        }
    }

    // Update boxes
    // First clear all box classes (except 'box')
    for (const key in boxElements) {
        boxElements[key].className = 'box';
    }
    
    state.boxes.forEach(box => {
        const key = `${box.r}-${box.c}`;
        if (boxElements[key]) {
            boxElements[key].classList.add(`p${box.player + 1}`);
        }
    });
}

function updateUI(state) {
    p1ScoreEl.innerText = state.scores[0];
    p2ScoreEl.innerText = state.scores[1];

    const p1Box = document.getElementById('p1-box');
    const p2Box = document.getElementById('p2-box');
    p1Box.classList.toggle('active-p1', state.currentPlayer === 0 && state.status === 'playing');
    p2Box.classList.toggle('active-p2', state.currentPlayer === 1 && state.status === 'playing');

    if (state.status === 'waiting') {
        overlay.classList.remove('hidden');
        statusEl.innerText = "Waiting for Player 2...";
    } else if (state.status === 'playing') {
        overlay.classList.add('hidden');
        statusEl.innerText = state.currentPlayer === myPlayerIndex ? "Your Turn!" : "Opponent's Turn...";
    } else if (state.status === 'finished') {
        const winner = state.scores[0] > state.scores[1] ? 0 : (state.scores[1] > state.scores[0] ? 1 : null);
        if (winner === null) statusEl.innerText = "Game Over - It's a Tie!";
        else statusEl.innerText = winner === myPlayerIndex ? "You Won! 🎉" : "Opponent Won!";
        restartBtn.classList.remove('hidden');
    }
}

function restartGame() {
    restartBtn.classList.add('hidden');
    socket.emit('restartGame', currentRoomId);
}

window.onresize = () => {
    SPACING = Math.min(window.innerWidth * 0.8, 400) / (DOTS - 1);
    initBoard();
    if (lastGameState) updateBoard(lastGameState);
};
