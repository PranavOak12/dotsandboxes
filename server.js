const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const rooms = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', (roomId) => {
        if (!roomId) roomId = uuidv4().substring(0, 8);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: [null, null],
                gameState: {
                    lines: {},
                    boxes: [],
                    scores: [0, 0],
                    currentPlayer: 0,
                    status: 'waiting'
                }
            };
        }

        const room = rooms[roomId];
        let playerIndex = room.players.indexOf(socket.id);

        if (playerIndex === -1) {
            playerIndex = room.players.indexOf(null);
            if (playerIndex === -1) {
                socket.emit('error', 'Room is full');
                return;
            }
            room.players[playerIndex] = socket.id;
        }

        socket.join(roomId);
        socket.emit('playerAssignment', { playerIndex, roomId });

        if (room.players.every(p => p !== null)) {
            room.gameState.status = 'playing';
            io.to(roomId).emit('gameStateUpdate', room.gameState);
        } else {
            socket.emit('gameStateUpdate', room.gameState);
        }
    });

    socket.on('makeMove', ({ roomId, move }) => {
        const room = rooms[roomId];
        if (!room || room.gameState.status !== 'playing') return;
        
        const playerIndex = room.players.indexOf(socket.id);
        if (playerIndex === -1 || playerIndex !== room.gameState.currentPlayer) return;

        const { type, r, c } = move;
        const lineKey = `${type}-${r}-${c}`;
        if (room.gameState.lines[lineKey] !== undefined) return;

        room.gameState.lines[lineKey] = playerIndex;
        const completedBoxes = checkBoxes(room.gameState.lines, type, r, c);

        if (completedBoxes.length > 0) {
            completedBoxes.forEach(box => {
                room.gameState.boxes.push({ ...box, player: playerIndex });
                room.gameState.scores[playerIndex]++;
            });
            // Player gets another turn, so currentPlayer stays the same
        } else {
            room.gameState.currentPlayer = room.gameState.currentPlayer === 0 ? 1 : 0;
        }

        const totalPossibleBoxes = 25; // For a 6x6 dot grid (5x5 boxes)
        if (room.gameState.scores[0] + room.gameState.scores[1] === totalPossibleBoxes) {
            room.gameState.status = 'finished';
        }

        io.to(roomId).emit('gameStateUpdate', room.gameState);
    });

    socket.on('restartGame', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.gameState = {
                lines: {},
                boxes: [],
                scores: [0, 0],
                currentPlayer: 0,
                status: room.players.every(p => p !== null) ? 'playing' : 'waiting'
            };
            io.to(roomId).emit('gameStateUpdate', room.gameState);
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const index = room.players.indexOf(socket.id);
            if (index !== -1) {
                room.players[index] = null;
                room.gameState.status = 'waiting';
                io.to(roomId).emit('playerLeft');
                if (room.players.every(p => p === null)) delete rooms[roomId];
                break;
            }
        }
    });
});

function checkBoxes(lines, type, r, c) {
    const DOTS_X = 6;
    const DOTS_Y = 6;
    const found = [];
    if (type === 'h') {
        if (r > 0) {
            if (lines[`h-${r-1}-${c}`] !== undefined && lines[`v-${r-1}-${c}`] !== undefined && lines[`v-${r-1}-${c+1}`] !== undefined) {
                found.push({r: r - 1, c});
            }
        }
        if (r < DOTS_Y - 1) {
            if (lines[`h-${r+1}-${c}`] !== undefined && lines[`v-${r}-${c}`] !== undefined && lines[`v-${r}-${c+1}`] !== undefined) {
                found.push({r, c});
            }
        }
    } else {
        if (c > 0) {
            if (lines[`v-${r}-${c-1}`] !== undefined && lines[`h-${r}-${c-1}`] !== undefined && lines[`h-${r+1}-${c-1}`] !== undefined) {
                found.push({r, c: c - 1});
            }
        }
        if (c < DOTS_X - 1) {
            if (lines[`v-${r}-${c+1}`] !== undefined && lines[`h-${r}-${c}`] !== undefined && lines[`h-${r+1}-${c}`] !== undefined) {
                found.push({r, c});
            }
        }
    }
    return found;
}

server.listen(PORT, () => {
    console.log(`Multiplayer Server running on http://localhost:${PORT}`);
});
