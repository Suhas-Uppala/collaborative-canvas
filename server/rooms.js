class RoomsManager {
    constructor() {
        this.rooms = new Map();
        this.userSessions = new Map();
        this.userColors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
            '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
            '#BB8FCE', '#85C1E9', '#F8B500', '#FF8C00'
        ];
    }

    getNextColor(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return this.userColors[0];

        const usedColors = Array.from(room.values()).map(u => u.color);
        const availableColor = this.userColors.find(c => !usedColors.includes(c));
        return availableColor || this.userColors[Math.floor(Math.random() * this.userColors.length)];
    }

    joinRoom(roomId, socketId, userId, userName) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Map());
        }

        const room = this.rooms.get(roomId);
        const color = this.getNextColor(roomId);

        const userSession = {
            roomId,
            userId,
            userName: userName || `User ${room.size + 1}`,
            color,
            socketId,
            cursorPosition: { x: 0, y: 0 }
        };

        room.set(socketId, userSession);
        this.userSessions.set(socketId, userSession);

        return userSession;
    }

    leaveRoom(socketId) {
        const session = this.userSessions.get(socketId);
        if (!session) return null;

        const room = this.rooms.get(session.roomId);
        if (room) {
            room.delete(socketId);

            if (room.size === 0) {
                this.rooms.delete(session.roomId);
            }
        }

        this.userSessions.delete(socketId);
        return session;
    }

    getRoomUsers(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return [];
        return Array.from(room.values());
    }

    getUserSession(socketId) {
        return this.userSessions.get(socketId) || null;
    }

    updateCursorPosition(socketId, position) {
        const session = this.userSessions.get(socketId);
        if (session) {
            session.cursorPosition = position;
        }
    }

    getRoomId(socketId) {
        const session = this.userSessions.get(socketId);
        return session ? session.roomId : null;
    }

    getActiveRooms() {
        return Array.from(this.rooms.keys());
    }
}

module.exports = new RoomsManager();
