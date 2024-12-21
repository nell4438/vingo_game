const express = require('express');
const Pusher = require('pusher');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Pusher
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve index.html for all routes (for client-side routing)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});



// // Serve the main page
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// // Add a catch-all route handler
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

const gameRooms = new Map(); // Room Code -> Room State

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function createNewRoom() {
    return {
        host: null,
        players: new Map(), // Socket ID -> Player Name
        drawnNumbers: new Set(),
        availableNumbers: new Set(),
        gameActive: false,
        playerCards: new Map() // Socket ID -> Bingo Card
    };
}

// Initialize available numbers (1-75)
function initializeAvailableNumbers(roomCode) {
    const room = gameRooms.get(roomCode);
    room.availableNumbers.clear();
    for (let i = 1; i <= 75; i++) {
        room.availableNumbers.add(i);
    }
}
// Get random number that hasn't been drawn yet
function getRandomNumber(roomCode) {
    const room = gameRooms.get(roomCode);
    const availableNums = Array.from(room.availableNumbers);
    if (availableNums.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * availableNums.length);
    const number = availableNums[randomIndex];

    room.availableNumbers.delete(number);
    room.drawnNumbers.add(number);

    return number;

}

app.post('/api/create-room', (req, res) => {
    const { playerName, playerId } = req.body;
    const roomCode = generateRoomCode();
    gameRooms.set(roomCode, createNewRoom());

    const room = gameRooms.get(roomCode);
    room.host = playerId;
    room.players.set(playerId, playerName);

    // Trigger room creation event
    pusher.trigger(`presence-room-${roomCode}`, 'room-created', {
        roomCode,
        players: Array.from(room.players.values())
    });

    res.json({
        roomCode,
        isHost: true
    });
});

app.post('/api/join-room', (req, res) => {
    const { roomCode, playerName, playerId } = req.body;
    const room = gameRooms.get(roomCode);

    if (!room) {
        return res.status(404).json({ error: 'Room does not exist' });
    }

    room.players.set(playerId, playerName);
    const card = generateBingoCard();
    room.playerCards.set(playerId, card);

    // Trigger player joined event
    pusher.trigger(`presence-room-${roomCode}`, 'player-joined', {
        players: Array.from(room.players.values()),
        newPlayer: playerName
    });

    res.json({
        card,
        players: Array.from(room.players.values())
    });
});

app.post('/api/draw-number', (req, res) => {
    const { roomCode, playerId } = req.body;
    const room = gameRooms.get(roomCode);

    if (playerId === room.host && room.gameActive) {
        const number = getRandomNumber(roomCode);
        if (number !== null) {
            pusher.trigger(`presence-room-${roomCode}`, 'number-drawn', {
                number
            });
            res.json({ number });
        } else {
            pusher.trigger(`presence-room-${roomCode}`, 'game-message', {
                message: 'All numbers have been drawn!'
            });
            res.json({ message: 'All numbers drawn' });
        }
    } else {
        res.status(403).json({ error: 'Not authorized' });
    }
});

app.post('/api/start-game', (req, res) => {
    const { roomCode, playerId } = req.body;
    const room = gameRooms.get(roomCode);

    if (playerId === room.host) {
        room.gameActive = true;
        room.drawnNumbers.clear();
        initializeAvailableNumbers(roomCode);

        pusher.trigger(`presence-room-${roomCode}`, 'game-started', {});
        res.json({ success: true });
    } else {
        res.status(403).json({ error: 'Not authorized' });
    }
});

app.post('/api/reset-game', (req, res) => {
    const { roomCode, playerId } = req.body;
    const room = gameRooms.get(roomCode);

    if (playerId === room.host) {
        room.gameActive = false;
        room.drawnNumbers.clear();
        initializeAvailableNumbers(roomCode);

        pusher.trigger(`presence-room-${roomCode}`, 'game-reset', {});
        res.json({ success: true });
    } else {
        res.status(403).json({ error: 'Not authorized' });
    }
});

app.post('/api/bingo-called', (req, res) => {
    const { roomCode, playerName, card } = req.body;
    const room = gameRooms.get(roomCode);

    if (room.gameActive) {
        if (verifyWin(card, room.drawnNumbers)) {
            room.gameActive = false;
            pusher.trigger(`presence-room-${roomCode}`, 'bingo-winner', {
                winner: playerName
            });
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    } else {
        res.status(400).json({ error: 'Game not active' });
    }
});

// Pusher authentication endpoint
app.post('/pusher/auth', (req, res) => {
    const socketId = req.body.socket_id;
    const channel = req.body.channel_name;
    const userId = req.body.userId || req.body.auth?.params?.userId;
    const userName = req.body.userName || req.body.auth?.params?.userName;

    // Validate the presence channel name format
    if (!channel.startsWith('presence-room-')) {
        return res.status(403).json({ error: 'Invalid channel' });
    }

    try {
        // Generate auth response for presence channel
        const presenceData = {
            user_id: userId,
            user_info: {
                name: userName
            }
        };

        const auth = pusher.authorizeChannel(socketId, channel, presenceData);
        res.json(auth);
    } catch (error) {
        console.error('Auth error:', error);
        res.status(403).json({ error: 'Unauthorized' });
    }
});
function generateRandomNumbers(min, max, count) {
    const numbers = [];
    while (numbers.length < count) {
        const num = Math.floor(Math.random() * (max - min + 1)) + min;
        if (!numbers.includes(num)) {
            numbers.push(num);

        }
    }
    return numbers;
}
// Helper function to generate a bingo card
function generateBingoCard() {
    const card = [];
    // B (1-15)
    const b = generateRandomNumbers(1, 15, 5);
    // I (16-30)
    const i = generateRandomNumbers(16, 30, 5);
    // N (31-45)
    const n = generateRandomNumbers(31, 45, 5);
    // G (46-60)
    const g = generateRandomNumbers(46, 60, 5);
    // O (61-75)
    const o = generateRandomNumbers(61, 75, 5);
    n[2] = "FREE";
    // Combine all columns
    for (let row = 0; row < 5; row++) {
        card.push([
            b[row],
            i[row],
            n[row],
            g[row],
            o[row]
        ]);

    }
    return card;
}
// Helper function to verify win
function verifyWin(card, drawnNumbers) {
    const drawn = Array.from(drawnNumbers);

    // Helper function to check if a pattern matches
    const checkPattern = (coordinates) => {
        return coordinates.every(([row, col]) => drawn.includes(card[row][col]));
    };

    // Row patterns
    for (let i = 0; i < 5; i++) {
        if (card[i].every(num => drawn.includes(num))) return true;
    }

    // Column patterns
    for (let col = 0; col < 5; col++) {
        if (card.every(row => drawn.includes(row[col]))) return true;
    }

    // Diagonal patterns
    const diagonalPatterns = [
        [[0, 4], [1, 3], [3, 1], [4, 0]], // Top-right to bottom-left
        [[0, 0], [1, 1], [3, 3], [4, 4]], // Top-left to bottom-right
        [[0, 3], [1, 2], [2, 1], [3, 0]], // Partial diagonal
        [[1, 4], [2, 3], [3, 2], [4, 1]], // Partial diagonal
        [[0, 1], [1, 2], [2, 3], [3, 4]], // Partial diagonal
        [[0, 0], [1, 1], [2, 2], [3, 3]], // Partial diagonal
    ];

    for (let pattern of diagonalPatterns) {
        if (checkPattern(pattern)) return true;
    }

    // Box patterns (2x2)
    const boxPatterns = [
        [[0, 0], [0, 1], [1, 0], [1, 1]], // Top-left
        [[0, 1], [0, 2], [1, 1], [1, 2]], // Top-middle
        [[0, 2], [0, 3], [1, 2], [1, 3]], // Top-middle-right
        [[0, 3], [0, 4], [1, 3], [1, 4]], // Top-right
        [[1, 0], [1, 1], [2, 0], [2, 1]], // Middle-left
        [[1, 3], [1, 4], [2, 3], [2, 4]], // Middle-right
        [[2, 3], [2, 4], [3, 3], [3, 4]], // Bottom-middle-right
        [[2, 0], [2, 1], [3, 0], [3, 1]], // Bottom-middle-left
        [[3, 0], [3, 1], [4, 0], [4, 1]], // Bottom-left
        [[3, 1], [3, 2], [4, 1], [4, 2]], // Bottom-middle
        [[3, 2], [3, 3], [4, 2], [4, 3]], // Bottom-middle-right
        [[3, 3], [3, 4], [4, 3], [4, 4]]  // Bottom-right
    ];

    for (let pattern of boxPatterns) {
        if (checkPattern(pattern)) return true;
    }

    // Corner patterns
    if (checkPattern([[0, 0], [0, 4], [4, 0], [4, 4]])) return true;

    // Flower patterns
    const flowerPatterns = [
        [[0, 2], [2, 0], [2, 4], [4, 2]], // Cross pattern
        [[1, 2], [2, 1], [2, 3], [3, 2]], // Center flower
        [[0, 1], [1, 0], [1, 2], [2, 1]], // Top flower
        [[0, 3], [1, 2], [1, 4], [2, 3]], // Top-right flower
        [[2, 1], [3, 0], [3, 2], [4, 1]], // Bottom-left flower
        [[2, 3], [3, 2], [3, 4], [4, 3]]  // Bottom-right flower
    ];

    for (let pattern of flowerPatterns) {
        if (checkPattern(pattern)) return true;
    }
    console.log("pattern ko dito ang tinatawag")
    return false;
}

// Export the server for Vercel
module.exports = app;
// // row and column pattern
// X X X X X
// · · · · ·
// · · · · ·
// · · · · ·
// · · · · ·

// · · · · ·
// X X X X X
// · · · · ·
// · · · · ·
// · · · · ·

// · · · · ·
// · · · · ·
// X X · X X
// · · · · ·
// · · · · ·

// · · · · ·
// · · · · ·
// · · · · ·
// X X X X X
// · · · · ·

// · · · · ·
// · · · · ·
// · · · · ·
// · · · · ·
// X X X X X

// X · · · ·
// X · · · ·
// X · · · ·
// X · · · ·
// X · · · ·

// · X · · ·
// · X · · ·
// · X · · ·
// · X · · ·
// · X · · ·

// · · X · ·
// · · X · ·
// · · · · ·
// · · X · ·
// · · X · ·

// · · · X ·
// · · · X ·
// · · · X ·
// · · · X ·
// · · · X ·

// · · · · X
// · · · · X
// · · · · X
// · · · · X
// · · · · X


// // diagonal pattern



// · · · · X
// · · · X ·
// · · · · ·
// · X · · ·
// X · · · ·

// X · · · ·
// · X · · ·
// · · · · ·
// · · · X ·
// · · · · X

// · · · X ·
// · · X · ·
// · X · · ·
// X · · · ·
// · · · · ·

// · · · · ·
// · · · · X
// · · · X ·
// · · X · ·
// · X · · ·

// · X · · ·
// · · X · ·
// · · · X ·
// · · · · X
// · · · · ·

// · · · · ·
// X · · · ·
// · X · · ·
// · · X · ·
// · · · X ·

// // box pattern

// X X · · ·
// X X · · ·
// · · · · ·
// · · · · ·
// · · · · ·


// · X X · ·
// · X X · ·
// · · · · ·
// · · · · ·
// · · · · ·


// · · X X ·
// · · X X ·
// · · · · ·
// · · · · ·
// · · · · ·


// · · · X X
// · · · X X
// · · · · ·
// · · · · ·
// · · · · ·

// · · · · ·
// X X · · ·
// X X · · ·
// · · · · ·
// · · · · ·

// · · · · ·
// · · · X X
// · · · X X
// · · · · ·
// · · · · ·

// · · · · ·
// · · · · ·
// · · · X X
// · · · X X
// · · · · ·

// · · · · ·
// · · · · ·
// X X · · ·
// X X · · ·
// · · · · ·

// · · · · ·
// · · · · ·
// · · · · ·
// X X · · ·
// X X · · ·


// · · · · ·
// · · · · ·
// · · · · ·
// · X X · ·
// · X X · ·

// · · · · ·
// · · · · ·
// · · · · ·
// · · X X ·
// · · X X ·



// · · · · ·
// · · · · ·
// · · · · ·
// · · · X X
// · · · X X

// X · · · X
// · · · · ·
// · · · · ·
// · · · · ·
// X · · · X

// · · · · ·
// · X · X ·
// · · · · ·
// · X · X ·
// · · · · ·

// // flower pattern

// · · X · ·
// · · · · ·
// X · · · X
// · · · · ·
// · · X · ·

// · · · · ·
// · · X · ·
// · X · X ·
// · · X · ·
// · · · · ·

// · X · · ·
// X · X · ·
// · X · · ·
// · · · · ·
// · · · · ·

// · · · X ·
// · · X · X
// · · · X ·
// · · · · ·
// · · · · ·

// · · · · ·
// · · · · ·
// · X · · ·
// X · X · ·
// · X · · ·


// · · · · ·
// · · · · ·
// · · · X ·
// · · X · X
// · · · X ·














// · · · · ·
// · · · · ·
// · · · · ·
// · · · · ·
// · · · · ·
