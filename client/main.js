(function () {
    'use strict';

    const STORAGE_KEYS = {
        USER_NAME: 'canvas_userName',
        ROOM_ID: 'canvas_roomId',
        SESSION_ACTIVE: 'canvas_sessionActive'
    };

    const elements = {
        joinModal: document.getElementById('join-modal'),
        userNameInput: document.getElementById('user-name-input'),
        roomIdInput: document.getElementById('room-id-input'),
        joinBtn: document.getElementById('join-btn'),

        appContainer: document.getElementById('app-container'),
        currentRoom: document.getElementById('current-room'),
        leaveRoomBtn: document.getElementById('leave-room-btn'),

        canvas: document.getElementById('drawing-canvas'),
        cursorsContainer: document.getElementById('cursors-container'),

        colorPicker: document.getElementById('color-picker'),
        colorPreview: document.getElementById('color-preview'),
        strokeSize: document.getElementById('stroke-size'),
        sizeValue: document.getElementById('size-value'),
        undoBtn: document.getElementById('undo-btn'),
        redoBtn: document.getElementById('redo-btn'),
        clearBtn: document.getElementById('clear-btn'),

        currentToolName: document.getElementById('current-tool-name'),

        usersList: document.getElementById('users-list'),

        connectionStatus: document.getElementById('connection-status'),
        statusText: document.querySelector('.status-text')
    };

    let currentSession = null;
    const users = new Map();
    const ghostCursors = new Map();

    const TOOL_NAMES = {
        'pen': 'Pen',
        'eraser': 'Eraser',
        'line': 'Line',
        'rectangle': 'Rectangle',
        'fill_rectangle': 'Filled Rectangle',
        'circle': 'Circle',
        'fill_circle': 'Filled Circle',
        'triangle': 'Triangle',
        'fill_triangle': 'Filled Triangle'
    };

    function init() {
        WebSocketModule.init();
        CanvasModule.init(elements.canvas);

        setupWebSocketCallbacks();

        setupCanvasCallbacks();

        setupUIEventListeners();

        setupToolButtons();

        setupQuickColors();

        checkExistingSession();

        console.log('Application initialized with paint tools');
    }

    function checkExistingSession() {
        const sessionActive = localStorage.getItem(STORAGE_KEYS.SESSION_ACTIVE);
        const savedUserName = localStorage.getItem(STORAGE_KEYS.USER_NAME);
        const savedRoomId = localStorage.getItem(STORAGE_KEYS.ROOM_ID);

        if (sessionActive === 'true' && savedUserName && savedRoomId) {
            console.log('🔄 Restoring session:', savedUserName, 'in room', savedRoomId);

            elements.userNameInput.value = savedUserName;
            elements.roomIdInput.value = savedRoomId;

            setTimeout(() => {
                joinRoom(savedUserName, savedRoomId);
            }, 500);
        }
    }

    function saveSession(userName, roomId) {
        localStorage.setItem(STORAGE_KEYS.USER_NAME, userName);
        localStorage.setItem(STORAGE_KEYS.ROOM_ID, roomId);
        localStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
    }

    function clearSession() {
        localStorage.removeItem(STORAGE_KEYS.SESSION_ACTIVE);
    }

    function setupWebSocketCallbacks() {
        WebSocketModule.setCallbacks({
            onConnectionChange: handleConnectionChange,
            onSessionCreated: handleSessionCreated,
            onUsersList: handleUsersList,
            onUserJoined: handleUserJoined,
            onUserLeft: handleUserLeft,
            onStrokeReceived: handleStrokeReceived,
            onDrawingUpdate: handleDrawingUpdate,
            onCursorUpdate: handleCursorUpdate,
            onSyncStrokes: handleSyncStrokes,
            onCanvasCleared: handleCanvasCleared
        });
    }

    function setupCanvasCallbacks() {
        CanvasModule.setCallbacks({
            onComplete: (stroke) => {
                WebSocketModule.emitStrokeComplete(stroke);
            },
            onStep: (segments) => {
                WebSocketModule.emitDrawingStep(segments);
            },
            onCursor: (position) => {
                WebSocketModule.emitCursorMove(position);
            }
        });
    }

    function setupToolButtons() {
        const toolButtons = document.querySelectorAll('[data-tool]');

        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;

                toolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                CanvasModule.setTool(tool);

                if (elements.currentToolName) {
                    elements.currentToolName.textContent = TOOL_NAMES[tool] || tool;
                }
            });
        });
    }

    function setupQuickColors() {
        const quickColors = document.querySelectorAll('.quick-color');

        quickColors.forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                elements.colorPicker.value = color;
                elements.colorPreview.style.background = color;
                CanvasModule.setColor(color);
            });
        });
    }

    function setupUIEventListeners() {
        elements.joinBtn.addEventListener('click', handleJoinRoom);
        elements.userNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleJoinRoom();
        });
        elements.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleJoinRoom();
        });

        if (elements.leaveRoomBtn) {
            elements.leaveRoomBtn.addEventListener('click', handleLeaveRoom);
        }

        elements.colorPicker.addEventListener('input', (e) => {
            const color = e.target.value;
            elements.colorPreview.style.background = color;
            CanvasModule.setColor(color);
        });

        elements.colorPreview.style.background = elements.colorPicker.value;

        elements.strokeSize.addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            elements.sizeValue.textContent = size;
            CanvasModule.setWidth(size);
        });

        elements.undoBtn.addEventListener('click', () => {
            WebSocketModule.emitUndo();
        });

        elements.redoBtn.addEventListener('click', () => {
            WebSocketModule.emitRedo();
        });

        elements.clearBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the canvas for everyone?')) {
                WebSocketModule.emitClearCanvas();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;

            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') {
                    e.preventDefault();
                    WebSocketModule.emitUndo();
                } else if (e.key === 'y') {
                    e.preventDefault();
                    WebSocketModule.emitRedo();
                }
            } else {
                switch (e.key.toLowerCase()) {
                    case 'p':
                        selectTool('pen');
                        break;
                    case 'e':
                        selectTool('eraser');
                        break;
                    case 'l':
                        selectTool('line');
                        break;
                    case 'r':
                        selectTool('rectangle');
                        break;
                    case 'c':
                        selectTool('circle');
                        break;
                    case 't':
                        selectTool('triangle');
                        break;
                }
            }
        });
    }

    function selectTool(tool) {
        const btn = document.querySelector(`[data-tool="${tool}"]`);
        if (btn) {
            btn.click();
        }
    }

    function handleJoinRoom() {
        const userName = elements.userNameInput.value.trim() || 'Anonymous';
        const roomId = elements.roomIdInput.value.trim() || 'default';

        joinRoom(userName, roomId);
    }

    function joinRoom(userName, roomId) {
        WebSocketModule.joinRoom(roomId, userName);

        saveSession(userName, roomId);

        elements.currentRoom.textContent = roomId;
        elements.joinModal.classList.remove('active');
        elements.appContainer.classList.remove('hidden');

        setTimeout(() => {
            CanvasModule.reinit();
        }, 100);
    }

    function handleLeaveRoom() {
        clearSession();

        ghostCursors.forEach((cursor, userId) => {
            cursor.remove();
        });
        ghostCursors.clear();

        users.clear();
        elements.usersList.innerHTML = '';

        CanvasModule.clearCanvas();

        currentSession = null;

        elements.joinModal.classList.add('active');
        elements.appContainer.classList.add('hidden');

        window.location.reload();
    }

    function handleConnectionChange(connected) {
        if (connected) {
            elements.connectionStatus.classList.add('connected');
            elements.connectionStatus.classList.remove('disconnected');
            elements.statusText.textContent = 'Connected';
        } else {
            elements.connectionStatus.classList.remove('connected');
            elements.connectionStatus.classList.add('disconnected');
            elements.statusText.textContent = 'Disconnected';
        }
    }

    function handleSessionCreated(session) {
        currentSession = session;

        elements.colorPicker.value = session.color;
        elements.colorPreview.style.background = session.color;
        CanvasModule.setColor(session.color);

        addUser({
            userId: session.userId,
            userName: session.userName,
            color: session.color
        }, true);
    }

    function handleUsersList(userList) {
        users.clear();
        elements.usersList.innerHTML = '';

        userList.forEach(user => {
            if (!currentSession || user.userId !== currentSession.userId) {
                addUser(user, false);
            }
        });
    }

    function handleUserJoined(user) {
        addUser(user, false);
    }

    function handleUserLeft(user) {
        removeUser(user.userId);
        removeGhostCursor(user.userId);
    }

    function handleStrokeReceived(stroke) {
        CanvasModule.addRemoteStroke(stroke);
    }

    function handleDrawingUpdate(data) {
        CanvasModule.handleRemoteDrawingStep(data.userId, data.segments);
    }

    function handleCursorUpdate(data) {
        updateGhostCursor(data.userId, data.userName, data.color, data.position);
    }

    function handleSyncStrokes(strokes) {
        CanvasModule.syncStrokes(strokes);
    }

    function handleCanvasCleared() {
        CanvasModule.clearCanvas();
    }

    function addUser(user, isSelf) {
        users.set(user.userId, user);

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar' + (isSelf ? ' current' : '');
        avatar.id = `user-${user.userId}`;
        avatar.style.backgroundColor = user.color;
        avatar.setAttribute('data-name', user.userName);
        avatar.textContent = user.userName.charAt(0).toUpperCase();

        elements.usersList.appendChild(avatar);
    }

    function removeUser(userId) {
        users.delete(userId);
        const avatar = document.getElementById(`user-${userId}`);
        if (avatar) {
            avatar.remove();
        }
    }

    function updateGhostCursor(userId, userName, color, position) {
        let cursor = ghostCursors.get(userId);

        if (!cursor) {
            cursor = createGhostCursor(userId, userName, color);
            ghostCursors.set(userId, cursor);
            elements.cursorsContainer.appendChild(cursor);
        }

        const canvasRect = elements.canvas.getBoundingClientRect();
        const localX = position.x * canvasRect.width;
        const localY = position.y * canvasRect.height;
        cursor.style.transform = `translate(${localX}px, ${localY}px)`;
    }

    function createGhostCursor(userId, userName, color) {
        const cursor = document.createElement('div');
        cursor.className = 'ghost-cursor';
        cursor.id = `cursor-${userId}`;

        cursor.innerHTML = `
            <div class="cursor-pointer">
                <svg viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1">
                    <path d="M4 4l16 8-8 3-3 8z"/>
                </svg>
            </div>
            <span class="cursor-label" style="background: ${color}">${userName}</span>
        `;

        return cursor;
    }

    function removeGhostCursor(userId) {
        const cursor = ghostCursors.get(userId);
        if (cursor) {
            cursor.remove();
            ghostCursors.delete(userId);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
