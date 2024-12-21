const pusher = new Pusher('9a5bf8582cf1d033c816', {
    cluster: 'ap1',
    forceTLS: true,
    authEndpoint: '/pusher/auth', // Add this
    auth: {
        params: {
            userId: playerId,
            userName: playerName
        }
    }
});
let channel; // Will store the Pusher channel instance

  // Game state variables
  let isHost = false;
  let playerName = '';
  let myBingoCard = [];
  let drawnNumbers = new Set();
  let gameActive = false;
  let currentRoom = '';
  let playerId = 'player-' + Math.random().toString(36).substring(2, 9);
  // DOM Elements
  const hostControls = document.getElementById('hostControls');
  const playerView = document.getElementById('playerView');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const playerNameInput = document.getElementById('playerName');
  const joinGameBtn = document.getElementById('joinGame');
  const drawNumberBtn = document.getElementById('drawNumber');
  const startGameBtn = document.getElementById('startGame');
  const resetGameBtn = document.getElementById('resetGame');
  const shuffleCardBtn = document.getElementById('shuffleCard');
  const currentNumberDisplay = document.getElementById('currentNumber');
  const drawnNumbersList = document.getElementById('drawnNumbersList');
  const playersList = document.getElementById('playersList');
  const bingoGrid = document.getElementById('bingoGrid');
  const lastDrawnDisplay = document.getElementById('lastDrawn');
  const callBingoBtn = document.getElementById('callBingo');
  const gameMessages = document.getElementById('gameMessages');
  
  // Add these variables at the top

  const roomInput = document.getElementById('roomInput'); // Add this input to your HTML
  const createRoomBtn = document.getElementById('createRoom'); // Add this button to your HTML
  const joinRoomBtn = document.getElementById('joinRoom'); // Add this button to your HTML
  // Add connection handling
pusher.connection.bind('connected', () => {
    console.log('Connected to Pusher');
});

pusher.connection.bind('error', (err) => {
    console.error('Pusher connection error:', err);
});
  function initializePusher(roomCode) {
      pusher.config.auth.params = {
        userId: playerId,
        userName: playerName
    };
    // Unsubscribe from previous channel if exists
    if (channel) {
        pusher.unsubscribe(`presence-room-${currentRoom}`);
    }

    // Subscribe to new channel
    channel = pusher.subscribe(`presence-room-${roomCode}`);

    // Bind to channel events
    channel.bind('pusher:subscription_succeeded', () => {
        console.log('Connected to channel:', roomCode);
    });

    channel.bind('pusher:subscription_error', (error) => {
        console.error('Subscription error:', error);
        pusher.config.auth.params = {
            userId: playerId,
            userName: playerName
        };
    });

    // Game events
    channel.bind('number-drawn', (data) => {
        const number = data.number;
        drawnNumbers.add(number);

        const getLetterPrefix = (num) => {
            if (num >= 1 && num <= 15) return 'B';
            if (num >= 16 && num <= 30) return 'I';
            if (num >= 31 && num <= 45) return 'N';
            if (num >= 46 && num <= 60) return 'G';
            if (num >= 61 && num <= 75) return 'O';
            return '';
        };

        const formattedNumber = `${getLetterPrefix(number)} ${number}`;
        currentNumberDisplay.textContent = formattedNumber;
        numberHistory.unshift(formattedNumber);
        numberHistory = numberHistory.slice(0, 3);
        lastDrawnDisplay.textContent = numberHistory.join(' ');
        updateDrawnNumbersList();
        showMessage(`Number drawn: ${getLetterPrefix(number)} ${number}`, 'default');
    });

    channel.bind('game-started', () => {
        gameActive = true;
        drawnNumbers.clear();
        updateDrawnNumbersList();
        currentNumberDisplay.textContent = '--';
        lastDrawnDisplay.textContent = '--';
        callBingoBtn.disabled = false;
        shuffleCardBtn.disabled = true;
        showMessage('Game has started! Cards are now locked.', 'red');
    });

    channel.bind('game-reset', () => {
        gameActive = false;
        drawnNumbers.clear();
        updateDrawnNumbersList();
        currentNumberDisplay.textContent = '--';
        lastDrawnDisplay.textContent = '--';
        callBingoBtn.disabled = true;
        shuffleCardBtn.disabled = false;
        document.querySelectorAll('.bingo-cell').forEach(cell => {
            cell.classList.remove('marked');
        });
        showMessage('Game has been reset! You can shuffle your card again.', 'green');
    });

    channel.bind('players-updated', (data) => {
        playersList.innerHTML = '';
        data.players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player;
            playersList.appendChild(li);
        });
    });

    channel.bind('bingo-winner', (data) => {
        gameActive = false;
        const winnerOverlay = document.createElement('div');
        winnerOverlay.className = 'winner-overlay';
        winnerOverlay.innerHTML = `
            <div class="winner-content">
                <h1>🎉 BINGO! 🎉</h1>
                <h2>${data.winner} has won the game!</h2>
                <button class="close-overlay-btn">Close</button>
            </div>
        `;
        document.body.appendChild(winnerOverlay);

        const closeBtn = winnerOverlay.querySelector('.close-overlay-btn');
        closeBtn.addEventListener('click', () => {
            winnerOverlay.remove();
        });

        showMessage(`${data.winner} has won the game!`, 'winner');
        callBingoBtn.disabled = true;
        shuffleCardBtn.disabled = false;
    });
}
  
  // Generate BINGO card
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
  // Generate random unique numbers for each column
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
  // Shuffle card handler
  shuffleCardBtn.addEventListener('click', () => {
      if (!gameActive) {
          myBingoCard = generateBingoCard();
          renderBingoCard(myBingoCard);
          showMessage('Card shuffled!', "default");
  
      } else {
          showMessage('Cannot shuffle card after game has started!', 'red');
  
      }
  });
  // Join game handler
  // joinGameBtn.addEventListener('click', () => {
  //     playerName = playerNameInput.value.trim();
  //     currentRoom = roomInput.value.trim();
  
  //     if (playerName && currentRoom) {
  //         socket.emit('joinGame', { playerName, room: currentRoom });
  //         welcomeScreen.style.display = 'none';
  //     } else {
  //         showMessage('Please enter your name and room code!', 'red');
  //     }
  // });
  
  // Add these new event listeners
  createRoomBtn.addEventListener('click', async () => {
    playerName = playerNameInput.value.trim();
    if (playerName) {
        try {
            const response = await fetch('/api/create-room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    playerName, 
                    playerId 
                })
            });
            const data = await response.json();
            if (data.roomCode) {
                currentRoom = data.roomCode;
                isHost = true;
                initializePusher(currentRoom);
                welcomeScreen.style.display = 'none';
                hostControls.style.display = 'block';
                showMessage(`Room created! Room code: ${currentRoom}`, 'green');
            }
        } catch (error) {
            showMessage('Error creating room', 'red');
        }
    } else {
        showMessage('Please enter your name!', 'red');
    }
});

  
joinRoomBtn.addEventListener('click', async () => {
    playerName = playerNameInput.value.trim();
    const roomCode = roomInput.value.trim();
    if (playerName && roomCode) {
        try {
            const response = await fetch('/api/join-room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    roomCode, 
                    playerName, 
                    playerId 
                })
            });
            const data = await response.json();
            if (data.success) {
                currentRoom = roomCode;
                initializePusher(currentRoom);
                welcomeScreen.style.display = 'none';
                playerView.style.display = 'block';
                showMessage(`Joined room: ${roomCode}`, 'green');
            }
        } catch (error) {
            showMessage('Error joining room', 'red');
        }
    } else {
        showMessage('Please enter your name and room code!', 'red');
    }
});
  
  
drawNumberBtn.addEventListener('click', async () => {
    if (isHost && gameActive) {
        try {
            await fetch('/api/draw-number', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    roomCode: currentRoom, 
                    playerId 
                })
            });
        } catch (error) {
            showMessage('Error drawing number', 'red');
        }
    }
});
startGameBtn.addEventListener('click', async () => {
    if (isHost) {
        try {
            await fetch('/api/start-game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    roomCode: currentRoom, 
                    playerId 
                })
            });
        } catch (error) {
            showMessage('Error starting game', 'red');
        }
    }
});
resetGameBtn.addEventListener('click', async () => {
    if (isHost) {
        try {
            await fetch('/api/reset-game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    roomCode: currentRoom, 
                    playerId 
                })
            });
        } catch (error) {
            showMessage('Error resetting game', 'red');
        }
    }
});

callBingoBtn.addEventListener('click', async () => {
    if (checkForWin()) {
        try {
            await fetch('/api/bingo-called', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    roomCode: currentRoom,
                    playerName,
                    card: myBingoCard
                })
            });
        } catch (error) {
            showMessage('Error calling bingo', 'red');
        }
    } else {
        showMessage('Invalid BINGO call - please check your card!', 'red');
    }
});
window.addEventListener('unload', () => {
    if (channel) {
        pusher.unsubscribe(`presence-room-${currentRoom}`);
    }
});
 
  // Render BINGO card
  function renderBingoCard(card) {
      bingoGrid.innerHTML = '';
      card.forEach((row, rowIndex) => {
          row.forEach((num, colIndex) => {
              const cell = document.createElement('div');
              cell.className = 'bingo-cell';
              cell.textContent = num;
              cell.dataset.row = rowIndex;
              cell.dataset.col = colIndex;
              cell.addEventListener('click', () => toggleCell(cell));
              bingoGrid.appendChild(cell);
  
          });
      });
  }
  // Toggle cell marked state
  function toggleCell(cell) {
      const number = parseInt(cell.textContent);
      if (drawnNumbers.has(number)) {
          cell.classList.toggle('marked');
          checkForWin();
      } else {
          if (cell.textContent == "FREE") {
              showMessage("Free na to ayaw mo pa ?", 'default');
          } else {
              showMessage("This number hasn't been called yet!", 'default');
          }
  
      }
  }
  // Check for win conditions
  function checkForWin() {
      const markedCells = document.querySelectorAll('.bingo-cell.marked');
      const positions = Array.from(markedCells).map(cell => ({
          row: parseInt(cell.dataset.row),
          col: parseInt(cell.dataset.col)
      }));
  
      // Helper function to check if a pattern matches
      const checkPattern = (coordinates) => {
          return coordinates.every(([row, col]) =>
              positions.some(pos => pos.row === row && pos.col === col)
          );
      };
  
      // Check rows
      for (let row = 0; row < 5; row++) {
          if (positions.filter(pos => pos.row === row).length === 5) return true;
      }
  
      // Check columns
      for (let col = 0; col < 5; col++) {
          if (positions.filter(pos => pos.col === col).length === 5) return true;
      }
  
      // Diagonal patterns
      const diagonalPatterns = [
          [[0, 4], [1, 3], [3, 1], [4, 0]], // Top-right to bottom-left
          [[0, 0], [1, 1], [3, 3], [4, 4]], // Top-left to bottom-right
          [[0, 3], [1, 2], [2, 1], [3, 0]], // Partial diagonal
          [[1, 4], [2, 3], [3, 2], [4, 1]], // Partial diagonal
          [[0, 1], [1, 2], [2, 3], [3, 4]], // Partial diagonal
          [[0, 0], [1, 1], [2, 2], [3, 3]]  // Partial diagonal
      ];
  
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
  
      // Corner pattern
      const cornerPattern = [[0, 0], [0, 4], [4, 0], [4, 4]];
  
      // Flower patterns
      const flowerPatterns = [
          [[0, 2], [2, 0], [2, 4], [4, 2]], // Cross pattern
          [[1, 2], [2, 1], [2, 3], [3, 2]], // Center flower
          [[0, 1], [1, 0], [1, 2], [2, 1]], // Top flower
          [[0, 3], [1, 2], [1, 4], [2, 3]], // Top-right flower
          [[2, 1], [3, 0], [3, 2], [4, 1]], // Bottom-left flower
          [[2, 3], [3, 2], [3, 4], [4, 3]]  // Bottom-right flower
      ];
  
      // Check all patterns
      for (let pattern of diagonalPatterns) {
          if (checkPattern(pattern)) return true;
      }
  
      for (let pattern of boxPatterns) {
          if (checkPattern(pattern)) return true;
      }
  
      if (checkPattern(cornerPattern)) return true;
  
      for (let pattern of flowerPatterns) {
          if (checkPattern(pattern)) return true;
      }
  
      return false;
  }
  // Update drawn numbers list
  function updateDrawnNumbersList() {
      drawnNumbersList.innerHTML = '';
      Array.from(drawnNumbers).sort((a, b) => a - b).forEach(number => {
          const span = document.createElement('span');
          span.textContent = number;
          drawnNumbersList.appendChild(span);
  
      });
  }
  // Show message
  function showMessage(message, color) {
      const messageDiv = document.createElement('div');
      messageDiv.className = `message color-${color}`;
  
      // Create inner content with icon (optional)
      const icon = getIconForMessage(color);
      messageDiv.innerHTML = `
          ${icon ? `<span class="message-icon">${icon}</span>` : ''}
          <span class="message-text">${message}</span>
      `;
  
      gameMessages.appendChild(messageDiv);
  
      // Remove the message after animation completes
      setTimeout(() => {
          messageDiv.remove();
      }, 5000);
  }
  
  // Helper function to get icons based on message type
  function getIconForMessage(color) {
      switch (color) {
          case 'green':
              return '✓';
          case 'red':
              return '⚠';
          case 'winner':
              return '🏆';
          default:
              return '📢';
      }
  }
  
  
  // Add this to your existing JavaScript
  const patterns = [
      // Row patterns
      "11111|00000|00000|00000|00000",
      "00000|11111|00000|00000|00000",
      "00000|00000|11011|00000|00000",
      "00000|00000|00000|11111|00000",
      "00000|00000|00000|00000|11111",
  
      // Column patterns
      "10000|10000|10000|10000|10000",
      "01000|01000|01000|01000|01000",
      "00100|00100|00000|00100|00100",
      "00010|00010|00010|00010|00010",
      "00001|00001|00001|00001|00001",
  
      // Diagonal patterns
      "00001|00010|00000|01000|10000",
      "10000|01000|00000|00010|00001",
      "00010|00100|01000|10000|00000",
      "00000|00001|00010|00100|01000",
      "01000|00100|00010|00001|00000",
      "00000|10000|01000|00100|00010",
  
      // Box patterns
      "11000|11000|00000|00000|00000",
      "01100|01100|00000|00000|00000",
      "00110|00110|00000|00000|00000",
      "00011|00011|00000|00000|00000",
      "00000|11000|11000|00000|00000",
      "00000|00011|00011|00000|00000",
      "00000|00000|00011|00011|00000",
      "00000|00000|11000|11000|00000",
      "00000|00000|00000|11000|11000",
      "00000|00000|00000|01100|01100",
      "00000|00000|00000|00110|00110",
      "00000|00000|00000|00011|00011",
  
      // Corner patterns
      "10001|00000|00000|00000|10001",
      "00000|01010|00000|01010|00000",
  
      // Flower patterns
      "00100|00000|10001|00000|00100",
      "00000|00100|01010|00100|00000",
      "01000|10100|01000|00000|00000",
      "00010|00101|00010|00000|00000",
      "00000|00000|01000|10100|01000",
      "00000|00000|00010|00101|00010"
  ];
  
  document.getElementById('showPatterns').addEventListener('click', showPatterns);
  const modal = document.getElementById('patternsModal');
  const span = document.getElementsByClassName('close')[0];
  
  function showPatterns() {
      const container = document.querySelector('.patterns-container');
      container.innerHTML = '';
  
      patterns.forEach(pattern => {
          const gridDiv = document.createElement('div');
          gridDiv.className = 'pattern-grid';
  
          const rows = pattern.split('|');
          rows.forEach(row => {
              for (let i = 0; i < row.length; i++) {
                  const cell = document.createElement('div');
                  cell.className = 'pattern-cell';
                  if (row[i] === '1') {
                      cell.classList.add('marked');
                  }
                  gridDiv.appendChild(cell);
              }
          });
  
          container.appendChild(gridDiv);
      });
  
      modal.style.display = "block";
  }
  
  span.onclick = function () {
      modal.style.display = "none";
  }
  
  window.onclick = function (event) {
      if (event.target == modal) {
          modal.style.display = "none";
      }
  }
