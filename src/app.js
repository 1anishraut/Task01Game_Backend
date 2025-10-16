const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "https://taskforjob01.netlify.app",
    methods: ["GET", "POST"],
  },
});

const users = {};
const rooms = [];

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  users[socket.id] = {
    socket,
    name: null,
    online: true,
    playing: false,
    choice: null,
    opponent: null,
  };

  // 🎮 When player requests to play
  socket.on("request_to_play", ({ playerName }) => {
    const currentUser = users[socket.id];
    if (!currentUser || !playerName) return;
    currentUser.name = playerName;

    // Find an available opponent
    const opponent = Object.values(users).find(
      (u) =>
        u.online && !u.playing && u.socket.id !== socket.id && u.name !== null
    );

    if (opponent) {
      // Pair them
      currentUser.playing = true;
      opponent.playing = true;
      currentUser.opponent = opponent;
      opponent.opponent = currentUser;

      rooms.push({ player1: currentUser, player2: opponent });

      // Notify both players
      currentUser.socket.emit("OpponentFound", { opponentName: opponent.name });
      opponent.socket.emit("OpponentFound", { opponentName: currentUser.name });

      console.log(`🎮 Match started: ${currentUser.name} vs ${opponent.name}`);
    } else {
      currentUser.socket.emit("OpponentNotFound");
      console.log(`⏳ Waiting for opponent: ${currentUser.name}`);
    }
  });

  // ✊✋✌️ Player choice handling
  socket.on("playerChoiceFromClient", ({ choice }) => {
    const player = users[socket.id];
    if (!player || !player.playing) return;

    const opponent = player.opponent;

    // 🛑 Check opponent validity
    if (!opponent || !users[opponent.socket.id]) {
      player.socket.emit("opponentLeftMatch");
      player.playing = false;
      player.opponent = null;
      return;
    }

    player.choice = choice;

    // If both have chosen
    if (opponent.choice) {
      player.socket.emit("opponentChoiceFromServer", {
        choice: opponent.choice,
      });
      opponent.socket.emit("opponentChoiceFromServer", {
        choice: player.choice,
      });

      // Reset for next round
      player.choice = null;
      opponent.choice = null;
    }
  });

  // 🔴 Handle disconnect
  socket.on("disconnect", () => {
    const player = users[socket.id];
    if (!player) return;

    console.log(`🔴 ${player.name || socket.id} disconnected`);

    player.online = false;
    player.playing = false;

    const opponent = player.opponent;
    if (opponent && opponent.socket.connected) {
      opponent.socket.emit("opponentLeftMatch");
      opponent.playing = false;
      opponent.opponent = null;
    }

    // Remove user from rooms
    const roomIndex = rooms.findIndex(
      (r) =>
        r.player1.socket.id === socket.id || r.player2.socket.id === socket.id
    );
    if (roomIndex !== -1) rooms.splice(roomIndex, 1);

    delete users[socket.id];
  });
});

httpServer.listen(4000, () =>
  console.log("✅ Rock Paper Scissors server running on port 4000")
);
