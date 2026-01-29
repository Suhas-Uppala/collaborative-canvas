const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const roomsManager = require('./rooms');
const stateManager = require('./state-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, '../client')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);

    socket.on('join_room', (data) => {
        const { roomId = 'default', userName } = data;
        const userId = uuidv4();

        socket.join(roomId);

        const session = roomsManager.joinRoom(roomId, socket.id, userId, userName);

        console.log(`${session.userName} (${userId}) joined room: ${roomId}`);

        socket.emit('session_created', {
            userId: session.userId,
            userName: session.userName,
            color: session.color,
            roomId
        });

        const existingStrokes = stateManager.getStrokes(roomId);
        if (existingStrokes.length > 0) {
            socket.emit('sync_strokes', existingStrokes);
        }

        const roomUsers = roomsManager.getRoomUsers(roomId);
        socket.emit('users_list', roomUsers.map(u => ({
            userId: u.userId,
            userName: u.userName,
            color: u.color,
            cursorPosition: u.cursorPosition
        })));

        socket.to(roomId).emit('user_joined', {
            userId: session.userId,
            userName: session.userName,
            color: session.color
        });
    });

    socket.on('stroke_complete', (strokeData) => {
        const session = roomsManager.getUserSession(socket.id);
        if (!session) return;

        const stroke = {
            strokeId: uuidv4(),
            userId: session.userId,
            userName: session.userName,
            color: strokeData.color || session.color,
            width: strokeData.width || 5,
            points: strokeData.points,
            timestamp: Date.now()
        };

        stateManager.addStroke(session.roomId, stroke);

        socket.to(session.roomId).emit('stroke_received', stroke);
    });

    socket.on('drawing_step', (data) => {
        const session = roomsManager.getUserSession(socket.id);
        if (!session) return;

        socket.to(session.roomId).emit('drawing_update', {
            userId: session.userId,
            segments: data
        });
    });

    socket.on('cursor_move', (position) => {
        const session = roomsManager.getUserSession(socket.id);
        if (!session) return;

        roomsManager.updateCursorPosition(socket.id, position);

        socket.to(session.roomId).emit('cursor_update', {
            userId: session.userId,
            userName: session.userName,
            color: session.color,
            position
        });
    });

    socket.on('undo_stroke', () => {
        const session = roomsManager.getUserSession(socket.id);
        if (!session) return;

        const undoneStroke = stateManager.undoStroke(session.roomId, session.userId);

        if (undoneStroke) {
            const allStrokes = stateManager.getStrokes(session.roomId);
            io.to(session.roomId).emit('sync_strokes', allStrokes);

            console.log(`${session.userName} undid stroke ${undoneStroke.strokeId}`);
        }
    });

    socket.on('redo_stroke', () => {
        const session = roomsManager.getUserSession(socket.id);
        if (!session) return;

        const redoneStroke = stateManager.redoStroke(session.roomId, session.userId);

        if (redoneStroke) {
            io.to(session.roomId).emit('stroke_received', redoneStroke);

            console.log(`${session.userName} redid stroke ${redoneStroke.strokeId}`);
        }
    });

    socket.on('clear_canvas', () => {
        const session = roomsManager.getUserSession(socket.id);
        if (!session) return;

        stateManager.clearRoom(session.roomId);
        io.to(session.roomId).emit('canvas_cleared');

        console.log(`${session.userName} cleared the canvas in room ${session.roomId}`);
    });

    socket.on('disconnect', () => {
        const session = roomsManager.leaveRoom(socket.id);

        if (session) {
            console.log(`${session.userName} left room: ${session.roomId}`);

            socket.to(session.roomId).emit('user_left', {
                userId: session.userId,
                userName: session.userName
            });
        }
    });
});

server.listen(PORT, () => {
    console.log(`
    Collaborative Canvas Server Running!
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Local:   http://localhost:${PORT}
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
});
