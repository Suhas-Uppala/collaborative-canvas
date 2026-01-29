const CanvasModule = (function () {
    let canvas, ctx;
    let isDrawing = false;
    let currentStroke = null;
    let currentColor = '#FFFFFF';
    let currentWidth = 5;
    let lastPoint = null;
    let startPoint = null;

    const TOOLS = {
        PEN: 'pen',
        ERASER: 'eraser',
        LINE: 'line',
        RECTANGLE: 'rectangle',
        CIRCLE: 'circle',
        TRIANGLE: 'triangle',
        FILL_RECTANGLE: 'fill_rectangle',
        FILL_CIRCLE: 'fill_circle',
        FILL_TRIANGLE: 'fill_triangle'
    };

    let currentTool = TOOLS.PEN;
    let fillShape = false;

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

        console.log('Canvas initialized with shape tools');
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

        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
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
    }

    function handleTouchStart(e) {
        e.preventDefault();
        handlePointerDown(e);
    }

    function handleTouchMove(e) {
        e.preventDefault();
        handlePointerMove(e);
    }

    function handlePointerDown(e) {
        isDrawing = true;
        const point = getCanvasCoordinates(e);
        lastPoint = point;
        startPoint = point;

        currentStroke = {
            points: [point],
            color: currentTool === TOOLS.ERASER ? BG_COLOR : currentColor,
            width: currentTool === TOOLS.ERASER ? currentWidth * 3 : currentWidth,
            tool: currentTool,
            startPoint: point
        };

        strokeBuffer = [];
    }

    function handlePointerMove(e) {
        const point = getCanvasCoordinates(e);

        emitCursorPosition(point);

        if (!isDrawing || !lastPoint) return;

        if (currentTool === TOOLS.PEN || currentTool === TOOLS.ERASER) {
            const drawColor = currentTool === TOOLS.ERASER ? BG_COLOR : currentColor;
            const drawWidth = currentTool === TOOLS.ERASER ? currentWidth * 3 : currentWidth;
            drawLineSegment(lastPoint, point, drawColor, drawWidth);

            currentStroke.points.push(point);

            strokeBuffer.push({
                start: lastPoint,
                end: point,
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

            lastPoint = point;
        } else {
            drawShapePreview(startPoint, point);
        }
    }

    function handlePointerUp(e) {
        if (!isDrawing) return;

        isDrawing = false;

        const endPoint = e ? getCanvasCoordinates(e) : lastPoint;

        clearPreview();

        if (currentTool !== TOOLS.PEN && currentTool !== TOOLS.ERASER) {
            if (startPoint && endPoint) {
                drawShape(startPoint, endPoint, currentColor, currentWidth, currentTool, false);

                currentStroke.endPoint = endPoint;
                currentStroke.points = [startPoint, endPoint];
            }
        }

        if (strokeBuffer.length > 0 && onDrawingStep) {
            onDrawingStep(strokeBuffer);
            strokeBuffer = [];
        }

        if (currentStroke) {
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

        previewCtx.strokeStyle = currentColor;
        previewCtx.fillStyle = currentColor;
        previewCtx.lineWidth = currentWidth;
        previewCtx.lineCap = 'round';
        previewCtx.lineJoin = 'round';
        previewCtx.setLineDash([5, 5]);

        drawShapeOnContext(previewCtx, start, end, currentTool, false);

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
        const fill = tool.startsWith('fill_');
        const shapeType = fill ? tool.replace('fill_', '') : tool;

        context.beginPath();

        switch (shapeType) {
            case 'line':
                context.moveTo(start.x, start.y);
                context.lineTo(end.x, end.y);
                context.stroke();
                break;

            case 'rectangle':
                const width = end.x - start.x;
                const height = end.y - start.y;
                if (fill) {
                    context.fillRect(start.x, start.y, width, height);
                } else {
                    context.strokeRect(start.x, start.y, width, height);
                }
                break;

            case 'circle':
                const radiusX = Math.abs(end.x - start.x) / 2;
                const radiusY = Math.abs(end.y - start.y) / 2;
                const centerX = start.x + (end.x - start.x) / 2;
                const centerY = start.y + (end.y - start.y) / 2;

                context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
                if (fill) {
                    context.fill();
                } else {
                    context.stroke();
                }
                break;

            case 'triangle':
                const midX = start.x + (end.x - start.x) / 2;
                context.moveTo(midX, start.y);
                context.lineTo(end.x, end.y);
                context.lineTo(start.x, end.y);
                context.closePath();
                if (fill) {
                    context.fill();
                } else {
                    context.stroke();
                }
                break;
        }
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
                drawShape(stroke.startPoint, stroke.endPoint, stroke.color, stroke.width, stroke.tool);
            } else if (stroke.points.length >= 2) {
                drawShape(stroke.points[0], stroke.points[1], stroke.color, stroke.width, stroke.tool);
            }
            return;
        }

        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

        for (let i = 1; i < stroke.points.length - 1; i++) {
            const xc = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
            const yc = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, xc, yc);
        }

        const last = stroke.points[stroke.points.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
    }

    function handleRemoteDrawingStep(userId, segments) {
        if (Array.isArray(segments)) {
            segments.forEach(segment => {
                drawLineSegment(segment.start, segment.end, segment.color, segment.width);
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

        if (tool === TOOLS.ERASER) {
            canvas.style.cursor = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'8\'/%3E%3C/svg%3E") 12 12, auto';
        } else {
            canvas.style.cursor = 'crosshair';
        }
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
        TOOLS
    };
})();

if (typeof window !== 'undefined') {
    window.CanvasModule = CanvasModule;
}
