class StateManager {
    constructor() {
        this.roomStrokes = new Map();
        this.redoStacks = new Map();
    }

    initRoom(roomId) {
        if (!this.roomStrokes.has(roomId)) {
            this.roomStrokes.set(roomId, []);
            this.redoStacks.set(roomId, new Map());
        }
    }

    addStroke(roomId, stroke) {
        this.initRoom(roomId);
        const strokes = this.roomStrokes.get(roomId);
        strokes.push(stroke);

        const redoStack = this.redoStacks.get(roomId);
        if (redoStack.has(stroke.userId)) {
            redoStack.set(stroke.userId, []);
        }
    }

    getStrokes(roomId) {
        this.initRoom(roomId);
        return this.roomStrokes.get(roomId);
    }

    undoStroke(roomId, userId) {
        this.initRoom(roomId);
        const strokes = this.roomStrokes.get(roomId);

        for (let i = strokes.length - 1; i >= 0; i--) {
            if (strokes[i].userId === userId) {
                const undoneStroke = strokes.splice(i, 1)[0];

                const redoStack = this.redoStacks.get(roomId);
                if (!redoStack.has(userId)) {
                    redoStack.set(userId, []);
                }
                redoStack.get(userId).push(undoneStroke);

                return undoneStroke;
            }
        }
        return null;
    }

    redoStroke(roomId, userId) {
        this.initRoom(roomId);
        const redoStack = this.redoStacks.get(roomId);

        if (!redoStack.has(userId) || redoStack.get(userId).length === 0) {
            return null;
        }

        const stroke = redoStack.get(userId).pop();
        this.roomStrokes.get(roomId).push(stroke);

        return stroke;
    }

    clearRoom(roomId) {
        this.roomStrokes.delete(roomId);
        this.redoStacks.delete(roomId);
    }

    hasStrokes(roomId) {
        return this.roomStrokes.has(roomId) && this.roomStrokes.get(roomId).length > 0;
    }
}

module.exports = new StateManager();
