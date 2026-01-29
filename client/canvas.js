const CanvasModule = (function () {
    let canvas, ctx;
    let isDrawing = false;
    let isPanning = false;
    let currentStroke = null;
    let currentColor = '#FFFFFF';
    let currentWidth = 5;
    let lastPoint = null;
    let startPoint = null;

    let panOffset = { x: 0, y: 0 };
    let lastPanPoint = null;

    const TOOLS = {
        PEN: 'pen',
        ERASER: 'eraser',
        LINE: 'line',
        PAN: 'pan'
    };

    let currentTool = TOOLS.PEN;

    let strokeBuffer = [];
    let lastEmitTime = 0;
    const EMIT_INTERVAL = 16;

    let previewCanvas, previewCtx;

    let completedStrokes = [];

    const BG_COLOR = '#fffcfa';

    let onStrokeComplete = null;
    let onDrawingStep = null;
    let onCursorMove = null;

    function init(canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext('2d', { alpha: false });

        createPreviewCanvas();

        resizeCanvas();
        window.addEventListener('resize', debounce(resizeCanvas, 100));

        setupEventListeners();

        clearCanvas();

        console.log('Canvas initialized with pan support');
    }

    function createPreviewCanvas() {
        previewCanvas = document.createElement('canvas');
        previewCanvas.id = 'preview-canvas';
        previewCanvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 10;
        `;
        canvas.parentElement.appendChild(previewCanvas);
        previewCtx = previewCanvas.getContext('2d');
    }

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        if (previewCanvas) {
            previewCanvas.width = rect.width * dpr;
            previewCanvas.height = rect.height * dpr;
            previewCtx.scale(dpr, dpr);
        }

        ctx.scale(dpr, dpr);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        redrawAll();
    }

    function getCanvasCoordinates(event) {
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;

        if (event.touches && event.touches.length > 0) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else if (event.changedTouches && event.changedTouches.length > 0) {
            clientX = event.changedTouches[0].clientX;
            clientY = event.changedTouches[0].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function screenToWorld(point) {
        return {
            x: point.x - panOffset.x,
            y: point.y - panOffset.y
        };
    }

    function worldToScreen(point) {
        return {
            x: point.x + panOffset.x,
            y: point.y + panOffset.y
        };
    }

    function setupEventListeners() {
        canvas.addEventListener('mousedown', handlePointerDown);
        canvas.addEventListener('mousemove', handlePointerMove);
        canvas.addEventListener('mouseup', handlePointerUp);
        canvas.addEventListener('mouseleave', handlePointerUp);

        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handlePointerUp);
        canvas.addEventListener('touchcancel', handlePointerUp);

        canvas.addEventListener('wheel', handleWheel, { passive: false });

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
    }

    let spacePressed = false;

    function handleKeyDown(e) {
        if (e.code === 'Space' && !spacePressed) {
            spacePressed = true;
            canvas.style.cursor = 'grab';
        }
    }

    function handleKeyUp(e) {
        if (e.code === 'Space') {
            spacePressed = false;
            updateCursor();
        }
    }

    function updateCursor() {
        if (currentTool === TOOLS.PAN) {
            canvas.style.cursor = isPanning ? 'grabbing' : 'grab';
        } else if (currentTool === TOOLS.ERASER) {
            canvas.style.cursor = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'8\'/%3E%3C/svg%3E") 12 12, auto';
        } else {
            canvas.style.cursor = 'crosshair';
        }
    }

    function handleWheel(e) {
        e.preventDefault();
        panOffset.x -= e.deltaX;
        panOffset.y -= e.deltaY;
        redrawAll();
    }

    function handleTouchStart(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            isPanning = true;
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            lastPanPoint = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
            return;
        }
        e.preventDefault();
        handlePointerDown(e);
    }

    function handleTouchMove(e) {
        if (e.touches.length === 2 && isPanning) {
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentPoint = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };

            panOffset.x += currentPoint.x - lastPanPoint.x;
            panOffset.y += currentPoint.y - lastPanPoint.y;
            lastPanPoint = currentPoint;

            redrawAll();
            return;
        }
        e.preventDefault();
        handlePointerMove(e);
    }

    function handlePointerDown(e) {
        const screenPoint = getCanvasCoordinates(e);

        if (spacePressed || currentTool === TOOLS.PAN) {
            isPanning = true;
            lastPanPoint = screenPoint;
            canvas.style.cursor = 'grabbing';
            return;
        }

        isDrawing = true;
        const worldPoint = screenToWorld(screenPoint);
        lastPoint = worldPoint;
        startPoint = worldPoint;

        currentStroke = {
            points: [worldPoint],
            color: currentTool === TOOLS.ERASER ? BG_COLOR : currentColor,
            width: currentTool === TOOLS.ERASER ? currentWidth * 3 : currentWidth,
            tool: currentTool,
            startPoint: worldPoint
        };

        strokeBuffer = [];
    }

    function handlePointerMove(e) {
        const screenPoint = getCanvasCoordinates(e);

        if (isPanning && lastPanPoint) {
            panOffset.x += screenPoint.x - lastPanPoint.x;
            panOffset.y += screenPoint.y - lastPanPoint.y;
            lastPanPoint = screenPoint;
            redrawAll();
            return;
        }

        const worldPoint = screenToWorld(screenPoint);

        emitCursorPosition(worldPoint);

        if (!isDrawing || !lastPoint) return;

        if (currentTool === TOOLS.PEN || currentTool === TOOLS.ERASER) {
            const drawColor = currentTool === TOOLS.ERASER ? BG_COLOR : currentColor;
            const drawWidth = currentTool === TOOLS.ERASER ? currentWidth * 3 : currentWidth;

            const screenStart = worldToScreen(lastPoint);
            const screenEnd = worldToScreen(worldPoint);
            drawLineSegment(screenStart, screenEnd, drawColor, drawWidth);

            currentStroke.points.push(worldPoint);

            strokeBuffer.push({
                start: lastPoint,
                end: worldPoint,
                color: drawColor,
                width: drawWidth
            });

            const now = Date.now();
            if (now - lastEmitTime >= EMIT_INTERVAL && onDrawingStep) {
                if (strokeBuffer.length > 0) {
                    onDrawingStep(strokeBuffer);
                    strokeBuffer = [];
                    lastEmitTime = now;
                }
            }

            lastPoint = worldPoint;
        } else {
            drawShapePreview(startPoint, worldPoint);
        }
    }

    function handlePointerUp(e) {
        if (isPanning) {
            isPanning = false;
            lastPanPoint = null;
            updateCursor();
            return;
        }

        if (!isDrawing) return;

        isDrawing = false;

        let endPoint = lastPoint;
        if (e) {
            try {
                const screenPoint = getCanvasCoordinates(e);
                endPoint = screenToWorld(screenPoint);
            } catch (err) {
                endPoint = lastPoint;
            }
        }

        clearPreview();

        if (currentTool !== TOOLS.PEN && currentTool !== TOOLS.ERASER && currentTool !== TOOLS.PAN) {
            if (startPoint && endPoint) {
                const screenStart = worldToScreen(startPoint);
                const screenEnd = worldToScreen(endPoint);
                drawShape(screenStart, screenEnd, currentColor, currentWidth, currentTool, false);

                currentStroke.endPoint = endPoint;
                currentStroke.points = [startPoint, endPoint];
            }
        }

        if (strokeBuffer.length > 0 && onDrawingStep) {
            onDrawingStep(strokeBuffer);
            strokeBuffer = [];
        }

        if (currentStroke && currentTool !== TOOLS.PAN) {
            if (currentTool === TOOLS.PEN || currentTool === TOOLS.ERASER) {
                if (currentStroke.points.length > 1) {
                    completedStrokes.push(currentStroke);
                    if (onStrokeComplete) {
                        onStrokeComplete(currentStroke);
                    }
                }
            } else {
                completedStrokes.push(currentStroke);
                if (onStrokeComplete) {
                    onStrokeComplete(currentStroke);
                }
            }
        }

        currentStroke = null;
        lastPoint = null;
        startPoint = null;
    }

    function drawShapePreview(start, end) {
        clearPreview();

        const screenStart = worldToScreen(start);
        const screenEnd = worldToScreen(end);

        previewCtx.strokeStyle = currentColor;
        previewCtx.fillStyle = currentColor;
        previewCtx.lineWidth = currentWidth;
        previewCtx.lineCap = 'round';
        previewCtx.lineJoin = 'round';
        previewCtx.setLineDash([5, 5]);

        drawShapeOnContext(previewCtx, screenStart, screenEnd, currentTool, false);

        previewCtx.setLineDash([]);
    }

    function clearPreview() {
        if (previewCanvas) {
            const rect = canvas.getBoundingClientRect();
            previewCtx.clearRect(0, 0, rect.width, rect.height);
        }
    }

    function drawShape(start, end, color, width, tool, isRemote = false) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        drawShapeOnContext(ctx, start, end, tool, true);
    }

    function drawShapeOnContext(context, start, end, tool, isFinal) {
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
    }

    let lastCursorEmit = 0;
    function emitCursorPosition(point) {
        const now = Date.now();
        if (now - lastCursorEmit >= 33 && onCursorMove) {
            onCursorMove(point);
            lastCursorEmit = now;
        }
    }

    function drawLineSegment(start, end, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
    }

    function drawStroke(stroke) {
        if (!stroke.points || stroke.points.length < 2) return;

        if (stroke.tool && stroke.tool !== TOOLS.PEN && stroke.tool !== TOOLS.ERASER) {
            if (stroke.startPoint && stroke.endPoint) {
                const screenStart = worldToScreen(stroke.startPoint);
                const screenEnd = worldToScreen(stroke.endPoint);
                drawShape(screenStart, screenEnd, stroke.color, stroke.width, stroke.tool);
            } else if (stroke.points.length >= 2) {
                const screenStart = worldToScreen(stroke.points[0]);
                const screenEnd = worldToScreen(stroke.points[1]);
                drawShape(screenStart, screenEnd, stroke.color, stroke.width, stroke.tool);
            }
            return;
        }

        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const screenPoints = stroke.points.map(p => worldToScreen(p));

        ctx.beginPath();
        ctx.moveTo(screenPoints[0].x, screenPoints[0].y);

        for (let i = 1; i < screenPoints.length - 1; i++) {
            const xc = (screenPoints[i].x + screenPoints[i + 1].x) / 2;
            const yc = (screenPoints[i].y + screenPoints[i + 1].y) / 2;
            ctx.quadraticCurveTo(screenPoints[i].x, screenPoints[i].y, xc, yc);
        }

        const last = screenPoints[screenPoints.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
    }

    function handleRemoteDrawingStep(userId, segments) {
        if (Array.isArray(segments)) {
            segments.forEach(segment => {
                const screenStart = worldToScreen(segment.start);
                const screenEnd = worldToScreen(segment.end);
                drawLineSegment(screenStart, screenEnd, segment.color, segment.width);
            });
        }
    }

    function addRemoteStroke(stroke) {
        completedStrokes.push(stroke);
        drawStroke(stroke);
    }

    function syncStrokes(strokes) {
        completedStrokes = strokes;
        redrawAll();
    }

    function redrawAll() {
        const rect = canvas.getBoundingClientRect();
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, rect.width, rect.height);

        completedStrokes.forEach(stroke => {
            drawStroke(stroke);
        });
    }

    function clearCanvas() {
        completedStrokes = [];
        panOffset = { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, rect.width, rect.height);
    }

    function setColor(color) {
        currentColor = color;
    }

    function setWidth(width) {
        currentWidth = width;
    }

    function setTool(tool) {
        currentTool = tool;
        updateCursor();
    }

    function getTool() {
        return currentTool;
    }

    function getTools() {
        return TOOLS;
    }

    function setCallbacks({ onComplete, onStep, onCursor }) {
        if (onComplete) onStrokeComplete = onComplete;
        if (onStep) onDrawingStep = onStep;
        if (onCursor) onCursorMove = onCursor;
    }

    function reinit() {
        resizeCanvas();
    }

    function resetPan() {
        panOffset = { x: 0, y: 0 };
        redrawAll();
    }

    function getPanOffset() {
        return { ...panOffset };
    }

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    return {
        init,
        reinit,
        setColor,
        setWidth,
        setTool,
        getTool,
        getTools,
        setCallbacks,
        handleRemoteDrawingStep,
        addRemoteStroke,
        syncStrokes,
        clearCanvas,
        redrawAll,
        resetPan,
        getPanOffset,
        TOOLS
    };
})();

if (typeof window !== 'undefined') {
    window.CanvasModule = CanvasModule;
}
