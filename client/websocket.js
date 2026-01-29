const WebSocketModule = (function () {
    let socket = null;
    let currentSession = null;
    let isConnected = false;

    let callbacks = {
        onSessionCreated: null,
        onStrokeReceived: null,
        onDrawingUpdate: null,
        onCursorUpdate: null,
        onUserJoined: null,
        onUserLeft: null,
        onUsersList: null,
        onSyncStrokes: null,
        onCanvasCleared: null,
        onConnectionChange: null
    };

    function init() {
        socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleError);

        socket.on('session_created', handleSessionCreated);
        socket.on('users_list', handleUsersList);
        socket.on('user_joined', handleUserJoined);
        socket.on('user_left', handleUserLeft);

        socket.on('stroke_received', handleStrokeReceived);
        socket.on('drawing_update', handleDrawingUpdate);
        socket.on('sync_strokes', handleSyncStrokes);
        socket.on('canvas_cleared', handleCanvasCleared);

        socket.on('cursor_update', handleCursorUpdate);

        console.log('🔌 WebSocket module initialized');
    }

    function handleConnect() {
        console.log('✅ Connected to server');
        isConnected = true;
        if (callbacks.onConnectionChange) {
            callbacks.onConnectionChange(true);
        }
    }

    function handleDisconnect() {
        console.log('❌ Disconnected from server');
        isConnected = false;
        if (callbacks.onConnectionChange) {
            callbacks.onConnectionChange(false);
        }
    }

    function handleError(error) {
        console.error('🔴 Connection error:', error);
    }

    function handleSessionCreated(session) {
        console.log('👤 Session created:', session);
        currentSession = session;
        if (callbacks.onSessionCreated) {
            callbacks.onSessionCreated(session);
        }
    }

    function handleUsersList(users) {
        console.log('👥 Users in room:', users);
        if (callbacks.onUsersList) {
            callbacks.onUsersList(users);
        }
    }

    function handleUserJoined(user) {
        console.log('➕ User joined:', user.userName);
        if (callbacks.onUserJoined) {
            callbacks.onUserJoined(user);
        }
    }

    function handleUserLeft(user) {
        console.log('➖ User left:', user.userName);
        if (callbacks.onUserLeft) {
            callbacks.onUserLeft(user);
        }
    }

    function handleStrokeReceived(stroke) {
        if (callbacks.onStrokeReceived) {
            callbacks.onStrokeReceived(stroke);
        }
    }

    function handleDrawingUpdate(data) {
        if (callbacks.onDrawingUpdate) {
            callbacks.onDrawingUpdate(data);
        }
    }

    function handleSyncStrokes(strokes) {
        console.log('🔄 Syncing strokes:', strokes.length);
        if (callbacks.onSyncStrokes) {
            callbacks.onSyncStrokes(strokes);
        }
    }

    function handleCanvasCleared() {
        console.log('🧹 Canvas cleared');
        if (callbacks.onCanvasCleared) {
            callbacks.onCanvasCleared();
        }
    }

    function handleCursorUpdate(data) {
        if (callbacks.onCursorUpdate) {
            callbacks.onCursorUpdate(data);
        }
    }

    function joinRoom(roomId, userName) {
        if (!socket || !isConnected) {
            console.error('Cannot join room: not connected');
            return;
        }

        socket.emit('join_room', { roomId, userName });
    }

    function emitStrokeComplete(stroke) {
        if (!socket || !isConnected) return;
        socket.emit('stroke_complete', stroke);
    }

    function emitDrawingStep(segments) {
        if (!socket || !isConnected) return;
        socket.emit('drawing_step', segments);
    }

    function emitCursorMove(position) {
        if (!socket || !isConnected) return;
        socket.emit('cursor_move', position);
    }

    function emitUndo() {
        if (!socket || !isConnected) return;
        socket.emit('undo_stroke');
    }

    function emitRedo() {
        if (!socket || !isConnected) return;
        socket.emit('redo_stroke');
    }

    function emitClearCanvas() {
        if (!socket || !isConnected) return;
        socket.emit('clear_canvas');
    }

    function setCallbacks(newCallbacks) {
        callbacks = { ...callbacks, ...newCallbacks };
    }

    function getSession() {
        return currentSession;
    }

    function getConnectionStatus() {
        return isConnected;
    }

    return {
        init,
        joinRoom,
        emitStrokeComplete,
        emitDrawingStep,
        emitCursorMove,
        emitUndo,
        emitRedo,
        emitClearCanvas,
        setCallbacks,
        getSession,
        getConnectionStatus
    };
})();

if (typeof window !== 'undefined') {
    window.WebSocketModule = WebSocketModule;
}
