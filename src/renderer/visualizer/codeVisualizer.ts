/**
 * codeVisualizer.ts — Memory & Concept Visualization
 *
 * Ported from CodingTeacherOld/Visualizer.h + .cpp (693 lines C++)
 *
 * Draws interactive diagrams of variables, pointers, memory layouts,
 * arrays, and call stacks on an HTML <canvas> element.
 *
 * Original used Direct2D (ID2D1HwndRenderTarget, ID2D1SolidColorBrush,
 * IDWriteTextFormat). Ported to Canvas 2D API which maps almost 1:1:
 *   - FillRoundedRectangle → ctx.roundRect() + ctx.fill()
 *   - DrawLine → ctx.beginPath() + ctx.lineTo() + ctx.stroke()
 *   - DrawText → ctx.fillText()
 *   - CreateSolidColorBrush → ctx.fillStyle = color
 *
 * This module has NO dependencies on Node.js, Monaco, or AI.
 * It only needs a <canvas> element to render to.
 *
 * Usage from app.ts:
 *   const { codeVisualizer } = require('./visualizer/codeVisualizer');
 *   codeVisualizer.attach(document.getElementById('visualizer-canvas'));
 *   codeVisualizer.visualizeCode('int score = 42;\nfloat speed = 3.5f;');
 *   codeVisualizer.render();
 */

// ── Enums ──

/**
 * Types of visualizations. Determines which render function is called.
 */
export enum VisualizationType {
    Memory = 'memory',           // Vertical memory layout (addresses ascending)
    Pointer = 'pointer',         // Two boxes with an arrow between them
    Stack = 'stack',             // Call stack with frames and local variables
    Variables = 'variables',     // Boxes for each variable (default)
    Array = 'array',             // Horizontal row of indexed cells
    LinkedList = 'linkedList',   // Linked list (future)
    Tree = 'tree',               // Tree structure (future)
    FlowChart = 'flowChart',     // Control flow diagram (future)
    ClassDiagram = 'classDiagram', // Class relationships (future)
}

// ── Data Structures ──

/**
 * RGBA color as 4 floats (0.0–1.0), matching the original D2D1_COLOR_F.
 * Converted to CSS color strings for Canvas 2D.
 */
export interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

/**
 * A single memory cell for visualization.
 * Used in the Memory visualization type — represents one addressable location.
 */
export interface MemoryCell {
    address: number;          // Simulated memory address (e.g., 0x00001000)
    label: string;            // Variable name or description
    value: string;            // Display value (e.g., "42", "0x00001000")
    type: string;             // C++ type (e.g., "int", "float", "int*")
    color: Color;             // Fill color for this cell
    isHighlighted: boolean;   // Whether to draw with highlight color
    isPointer: boolean;       // Whether this cell holds a pointer value
    pointsTo: number;         // If isPointer, the address it points to
}

/**
 * A variable for visualization.
 * Used in the Variables, Pointer, and Array visualization types.
 */
export interface VariableVis {
    name: string;
    type: string;
    value: string;
    address: number;
    size: number;             // Size in bytes (for layout calculation)
    isPointer: boolean;
    color: Color;
}

/**
 * A call stack frame for visualization.
 * Used in the Stack visualization type.
 */
export interface StackFrame {
    functionName: string;
    localVariables: VariableVis[];
    returnAddress: number;
    isActive: boolean;        // Whether this is the currently executing frame
}

/**
 * Animation state for stepped visualizations.
 */
export interface VisAnimation {
    isAnimating: boolean;
    progress: number;         // 0.0 to 1.0 within current step
    currentStep: number;
    totalSteps: number;
    description: string;      // Status text shown during animation
}

// ── FlowChart Types ──

/**
 * A node in a flow chart diagram.
 */
export interface FlowNode {
    id: string;
    label: string;
    type: 'start' | 'end' | 'process' | 'decision' | 'io';
    x: number;
    y: number;
}

/**
 * An edge connecting two flow chart nodes.
 */
export interface FlowEdge {
    from: string;
    to: string;
    label?: string;     // "true" / "false" for decisions
}

// ── Class Diagram Types ──

/**
 * A UML-style class box.
 */
export interface ClassBox {
    name: string;
    members: { visibility: string; name: string; type: string }[];
    methods: { visibility: string; name: string; returnType: string; params: string }[];
    x: number;
    y: number;
}

/**
 * A relationship between two classes.
 */
export interface ClassRelation {
    from: string;
    to: string;
    type: 'inherits' | 'contains' | 'uses';
}

// ── Color Constants ──
// These match the original C++ member variables exactly.

const COLORS = {
    bg:        { r: 0.10, g: 0.10, b: 0.13, a: 1.0 },
    cell:      { r: 0.20, g: 0.20, b: 0.27, a: 1.0 },
    highlight: { r: 0.40, g: 0.40, b: 0.95, a: 1.0 },
    pointer:   { r: 0.90, g: 0.50, b: 0.30, a: 1.0 },
    text:      { r: 1.00, g: 1.00, b: 1.00, a: 1.0 },
    address:   { r: 0.60, g: 0.60, b: 0.70, a: 1.0 },
    border:    { r: 0.40, g: 0.40, b: 0.50, a: 1.0 },
};

// ── Helpers ──

/** Convert our Color struct to a CSS rgba() string. */
function colorToCSS(c: Color): string {
    return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;
}

/** Format a number as a hex address string like "0x00001000". */
function hexAddr(addr: number): string {
    return '0x' + addr.toString(16).padStart(8, '0').toUpperCase();
}

// ── The Visualizer ──

export class CodeVisualizer {
    /** The canvas element we render to. Set via attach(). */
    private canvas: HTMLCanvasElement | null = null;

    /** The 2D rendering context. */
    private ctx: CanvasRenderingContext2D | null = null;

    /** Current visualization type. */
    private type: VisualizationType = VisualizationType.Variables;

    /** Data: memory cells (for Memory type). */
    private memoryCells: MemoryCell[] = [];

    /** Data: variables (for Variables, Pointer, Array types). */
    private variables: VariableVis[] = [];

    /** Data: stack frames (for Stack type). */
    private stackFrames: StackFrame[] = [];

    /** Animation state. */
    private animation: VisAnimation = {
        isAnimating: false, progress: 0, currentStep: 0, totalSteps: 0, description: '',
    };

    /** Data: flow chart nodes. */
    private flowNodes: FlowNode[] = [];

    /** Data: flow chart edges. */
    private flowEdges: FlowEdge[] = [];

    /** Data: class diagram boxes. */
    private classBoxes: ClassBox[] = [];

    /** Data: class diagram relationships. */
    private classRelations: ClassRelation[] = [];

    // ── Setup ──

    /**
     * Attach the visualizer to a canvas element.
     * Must be called before any rendering.
     * The canvas is resized to fill its CSS dimensions (handles HiDPI).
     */
    attach(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resizeCanvas();
    }

    /**
     * Resize the canvas to match its CSS layout dimensions.
     * Handles HiDPI displays by scaling the backing store.
     * Call this if the panel is resized.
     */
    resizeCanvas(): void {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        if (this.ctx) {
            this.ctx.scale(dpr, dpr);
        }
    }

    /** Set the visualization type. */
    setType(type: VisualizationType): void {
        this.type = type;
    }

    /** Clear all visualization data. */
    clear(): void {
        this.memoryCells = [];
        this.variables = [];
        this.stackFrames = [];
        this.flowNodes = [];
        this.flowEdges = [];
        this.classBoxes = [];
        this.classRelations = [];
        this.animation = {
            isAnimating: false, progress: 0, currentStep: 0, totalSteps: 0, description: '',
        };
    }

    // ── Data Input ──

    /** Add a memory cell (for Memory visualization). */
    addMemoryCell(cell: MemoryCell): void {
        this.memoryCells.push(cell);
    }

    /** Add a variable (for Variables visualization). */
    addVariable(v: VariableVis): void {
        this.variables.push(v);
    }

    /** Add a stack frame (for Stack visualization). */
    addStackFrame(frame: StackFrame): void {
        this.stackFrames.push(frame);
    }

    // ── High-Level Visualize Commands ──

    /**
     * Parse simple C++ variable declarations and visualize them.
     *
     * Input example:
     *   "int score = 42;\nfloat speed = 3.5f;\nint* ptr = &score;"
     *
     * This is a simple line-by-line parser that looks for "type name = value;"
     * patterns. It won't handle complex C++ — it's for teaching purposes.
     *
     * Ported 1:1 from Visualizer::VisualizeCode().
     */
    visualizeCode(code: string): void {
        this.clear();
        this.type = VisualizationType.Variables;

        let nextAddress = 0x00001000;

        const lines = code.split('\n');
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('//')) continue;

            const eqPos = line.indexOf('=');
            if (eqPos === -1) continue;

            // Parse left side: "type name"
            const left = line.substring(0, eqPos).trim();
            const lastSpace = left.lastIndexOf(' ');
            if (lastSpace === -1) continue;

            const type = left.substring(0, lastSpace).trim();
            let name = left.substring(lastSpace + 1).trim();

            // Remove leading * from name (pointer declared as "int *ptr")
            if (name.startsWith('*')) name = name.substring(1);

            // Parse right side: "value;"
            let value = line.substring(eqPos + 1).replace(';', '').trim();

            // Detect pointer
            const isPointer = type.includes('*') || left.includes('*');

            this.variables.push({
                name,
                type,
                value,
                address: nextAddress,
                size: 4,
                isPointer,
                color: isPointer ? COLORS.pointer : COLORS.cell,
            });

            nextAddress += 4;
        }
    }

    /**
     * Create a pointer visualization showing one variable pointing to another.
     * Shows two boxes with an arrow from the pointer to the pointee.
     *
     * Ported 1:1 from Visualizer::VisualizePointer().
     */
    visualizePointer(pointerName: string, pointeeName: string): void {
        this.clear();
        this.type = VisualizationType.Pointer;

        // The pointee (the variable being pointed to)
        this.variables.push({
            name: pointeeName,
            type: 'int',
            value: '42',
            address: 0x00001000,
            size: 4,
            isPointer: false,
            color: COLORS.cell,
        });

        // The pointer (holds the address of the pointee)
        this.variables.push({
            name: pointerName,
            type: 'int*',
            value: '0x00001000',
            address: 0x00001004,
            size: 4,
            isPointer: true,
            color: COLORS.pointer,
        });
    }

    /**
     * Create an array visualization.
     * Shows a horizontal row of indexed cells.
     *
     * Ported 1:1 from Visualizer::VisualizeArray().
     */
    visualizeArray(arrayName: string, values: string[]): void {
        this.clear();
        this.type = VisualizationType.Array;

        const baseAddr = 0x00001000;
        for (let i = 0; i < values.length; i++) {
            this.variables.push({
                name: `${arrayName}[${i}]`,
                type: 'int',
                value: values[i],
                address: baseAddr + i * 4,
                size: 4,
                isPointer: false,
                color: COLORS.cell,
            });
        }
    }

    /**
     * Parse a visualization command string from lesson content.
     *
     * The lesson system uses special strings in Visualization content items:
     *   "VARIABLE:score:int:42" → single variable box
     *   "POINTER:ptr:score" → pointer diagram
     *   "ARRAY:nums:1,2,3,4,5" → array diagram
     *
     * This bridges the lesson system to the visualizer.
     */
    parseCommand(command: string): void {
        const parts = command.split(':');
        if (parts.length < 2) return;

        switch (parts[0]) {
            case 'VARIABLE':
                // VARIABLE:name:type:value
                this.clear();
                this.type = VisualizationType.Variables;
                this.variables.push({
                    name: parts[1] || 'x',
                    type: parts[2] || 'int',
                    value: parts[3] || '0',
                    address: 0x00001000,
                    size: 4,
                    isPointer: false,
                    color: COLORS.cell,
                });
                break;

            case 'POINTER':
                // POINTER:ptrName:pointeeName
                this.visualizePointer(parts[1] || 'ptr', parts[2] || 'x');
                break;

            case 'ARRAY':
                // ARRAY:name:val1,val2,val3,...
                this.visualizeArray(
                    parts[1] || 'arr',
                    (parts[2] || '0').split(',')
                );
                break;

            case 'FLOW':
                // FLOW:node1->node2->decision?->yes:node3->end
                this.parseFlowCommand(parts.slice(1).join(':'));
                break;

            case 'IF':
                // IF:condition:trueBranch:falseBranch
                this.visualizeIfElse(parts[1] || 'condition', parts[2] || 'then', parts[3] || 'else');
                break;

            case 'LOOP':
                // LOOP:for:condition:body  or  LOOP:while:condition:body
                this.visualizeLoop(
                    (parts[1] === 'while' ? 'while' : 'for') as 'for' | 'while',
                    parts[2] || 'i < n',
                    parts[3] || 'body'
                );
                break;

            case 'CLASS':
                // CLASS:ClassName:+member1:type,+member2:type|+method1():void,+method2(int):bool
                this.parseClassCommand(parts.slice(1).join(':'));
                break;

            case 'INHERIT':
                // INHERIT:Child->Parent
                this.parseInheritCommand(parts.slice(1).join(':'));
                break;

            default:
                // Unknown command — try parsing as code
                this.visualizeCode(command);
                break;
        }
    }

    // ── Animation ──

    /**
     * Start a stepped animation.
     * Each step can highlight different elements.
     */
    startAnimation(steps: number, description: string): void {
        this.animation = {
            isAnimating: true,
            progress: 0,
            currentStep: 0,
            totalSteps: steps,
            description,
        };
    }

    /**
     * Update animation progress. Call each frame (e.g., via requestAnimationFrame).
     * @param deltaTime — seconds since last frame
     */
    updateAnimation(deltaTime: number): void {
        if (!this.animation.isAnimating) return;

        this.animation.progress += deltaTime * 0.5; // Animation speed
        if (this.animation.progress >= 1.0) {
            this.animation.progress = 0;
            this.animation.currentStep++;
            if (this.animation.currentStep >= this.animation.totalSteps) {
                this.animation.isAnimating = false;
            }
        }
    }

    /** Advance to the next animation step. */
    nextStep(): void {
        if (this.animation.currentStep < this.animation.totalSteps - 1) {
            this.animation.currentStep++;
            this.animation.progress = 0;
        } else {
            this.animation.isAnimating = false;
        }
    }

    /** Get current animation state (for UI controls). */
    getAnimation(): VisAnimation {
        return { ...this.animation };
    }

    // ── Rendering ──

    /**
     * Render the current visualization to the canvas.
     * Call this after setting data and whenever the canvas needs redrawing.
     */
    render(): void {
        if (!this.canvas || !this.ctx) return;

        const ctx = this.ctx;
        const w = this.canvas.getBoundingClientRect().width;
        const h = this.canvas.getBoundingClientRect().height;

        // Clear and draw background
        ctx.fillStyle = colorToCSS(COLORS.bg);
        this.roundRect(0, 0, w, h, 8);
        ctx.fill();

        // Dispatch to the appropriate renderer
        switch (this.type) {
            case VisualizationType.Memory:
                this.renderMemory(w, h);
                break;
            case VisualizationType.Pointer:
                this.renderPointer(w, h);
                break;
            case VisualizationType.Stack:
                this.renderStack(w, h);
                break;
            case VisualizationType.Array:
                this.renderArray(w, h);
                break;
            case VisualizationType.FlowChart:
                this.renderFlowChart(w, h);
                break;
            case VisualizationType.ClassDiagram:
                this.renderClassDiagram(w, h);
                break;
            case VisualizationType.Variables:
            default:
                this.renderVariables(w, h);
                break;
        }

        // Draw animation description if active
        if (this.animation.isAnimating && this.animation.description) {
            ctx.font = '12px "Segoe UI", sans-serif';
            ctx.fillStyle = colorToCSS(COLORS.text);
            ctx.textAlign = 'center';
            ctx.fillText(this.animation.description, w / 2, h - 15);
        }
    }

    // ── Private Renderers ──

    /**
     * Render variables as a row of boxes (wraps to next row if needed).
     * Ported from RenderVariablesVisualization().
     */
    private renderVariables(w: number, h: number): void {
        if (this.variables.length === 0) return;

        const cellW = 100;
        const cellH = 50;
        const spacing = 20;

        let x = 30;
        let y = 50;

        for (const v of this.variables) {
            // Wrap to next row
            if (x + cellW > w - 20) {
                x = 30;
                y += cellH + 60;
            }

            this.drawMemoryCell({
                address: v.address,
                label: v.name,
                value: v.value,
                type: v.type,
                color: v.color,
                isHighlighted: false,
                isPointer: v.isPointer,
                pointsTo: 0,
            }, x, y, cellW, cellH);

            x += cellW + spacing;
        }
    }

    /**
     * Render a pointer diagram: pointee on the left, pointer on the right, arrow between.
     * Ported from RenderPointerVisualization().
     */
    private renderPointer(w: number, h: number): void {
        if (this.variables.length < 2) return;

        const cellW = 100;
        const cellH = 50;

        // Pointee on the left
        const pointeeX = 50;
        const pointeeY = h / 2 - cellH / 2;
        this.drawMemoryCell({
            address: this.variables[0].address,
            label: this.variables[0].name,
            value: this.variables[0].value,
            type: this.variables[0].type,
            color: COLORS.cell,
            isHighlighted: false,
            isPointer: false,
            pointsTo: 0,
        }, pointeeX, pointeeY, cellW, cellH);

        // Pointer on the right
        const pointerX = w - 150;
        const pointerY = pointeeY;
        this.drawMemoryCell({
            address: this.variables[1].address,
            label: this.variables[1].name,
            value: this.variables[1].value,
            type: this.variables[1].type,
            color: COLORS.pointer,
            isHighlighted: false,
            isPointer: true,
            pointsTo: this.variables[0].address,
        }, pointerX, pointerY, cellW, cellH);

        // Arrow from pointer to pointee
        this.drawArrow(
            pointerX, pointerY + cellH / 2,
            pointeeX + cellW, pointeeY + cellH / 2,
            COLORS.pointer
        );
    }

    /**
     * Render memory cells vertically (like a memory dump).
     * Ported from RenderMemoryVisualization().
     */
    private renderMemory(w: number, h: number): void {
        const cellW = 120;
        const cellH = 40;
        const spacing = 5;

        const x = (w - cellW) / 2;
        let y = 40;

        for (const cell of this.memoryCells) {
            if (y + cellH > h - 20) break;
            this.drawMemoryCell(cell, x, y, cellW, cellH);
            y += cellH + spacing;
        }
    }

    /**
     * Render the call stack with frames and their local variables.
     * Ported from RenderStackVisualization().
     */
    private renderStack(w: number, h: number): void {
        if (this.stackFrames.length === 0) return;

        const frameW = w - 40;
        let y = 30;

        for (const frame of this.stackFrames) {
            // Frame header
            const headerColor = frame.isActive ? COLORS.highlight : COLORS.cell;
            this.drawBox(20, y, frameW, 25, headerColor, COLORS.text, 4);

            if (this.ctx) {
                this.ctx.font = 'bold 12px "Segoe UI", sans-serif';
                this.ctx.fillStyle = colorToCSS(COLORS.text);
                this.ctx.textAlign = 'center';
                this.ctx.fillText(frame.functionName, 20 + frameW / 2, y + 16);
            }

            y += 30;

            // Local variables inside this frame
            for (const v of frame.localVariables) {
                this.drawMemoryCell({
                    address: v.address,
                    label: v.name,
                    value: v.value,
                    type: v.type,
                    color: v.color,
                    isHighlighted: false,
                    isPointer: v.isPointer,
                    pointsTo: 0,
                }, 30, y, 80, 35);
                y += 55;
            }

            y += 20; // Space between frames
        }
    }

    /**
     * Render an array as a horizontal row of indexed cells.
     * Ported from RenderArrayVisualization().
     */
    private renderArray(w: number, h: number): void {
        if (this.variables.length === 0) return;

        const cellW = 60;
        const cellH = 50;
        const spacing = 5;

        const totalW = this.variables.length * (cellW + spacing) - spacing;
        const startX = (w - totalW) / 2;
        const y = (h - cellH) / 2;

        for (let i = 0; i < this.variables.length; i++) {
            const v = this.variables[i];
            const x = startX + i * (cellW + spacing);

            this.drawMemoryCell({
                address: v.address,
                label: `[${i}]`,
                value: v.value,
                type: v.type,
                color: COLORS.cell,
                isHighlighted: false,
                isPointer: false,
                pointsTo: 0,
            }, x, y, cellW, cellH);
        }
    }

    // ── FlowChart Methods ──

    /**
     * Visualize an if/else branch as a flow chart.
     * Creates: start → decision diamond → true/false branches → end
     */
    visualizeIfElse(condition: string, trueBranch: string, falseBranch: string): void {
        this.clear();
        this.type = VisualizationType.FlowChart;

        this.flowNodes = [
            { id: 'start', label: 'Start', type: 'start', x: 0, y: 0 },
            { id: 'check', label: condition, type: 'decision', x: 0, y: 0 },
            { id: 'true', label: trueBranch, type: 'process', x: 0, y: 0 },
            { id: 'false', label: falseBranch, type: 'process', x: 0, y: 0 },
            { id: 'end', label: 'End', type: 'end', x: 0, y: 0 },
        ];
        this.flowEdges = [
            { from: 'start', to: 'check' },
            { from: 'check', to: 'true', label: 'true' },
            { from: 'check', to: 'false', label: 'false' },
            { from: 'true', to: 'end' },
            { from: 'false', to: 'end' },
        ];
    }

    /**
     * Visualize a loop as a flow chart.
     * Creates: start → condition check → body → back to check → end
     */
    visualizeLoop(loopType: 'for' | 'while', condition: string, body: string): void {
        this.clear();
        this.type = VisualizationType.FlowChart;

        const initLabel = loopType === 'for' ? 'Initialize' : '';
        const nodes: FlowNode[] = [
            { id: 'start', label: 'Start', type: 'start', x: 0, y: 0 },
        ];
        if (loopType === 'for') {
            nodes.push({ id: 'init', label: initLabel, type: 'process', x: 0, y: 0 });
        }
        nodes.push(
            { id: 'check', label: condition, type: 'decision', x: 0, y: 0 },
            { id: 'body', label: body, type: 'process', x: 0, y: 0 },
            { id: 'end', label: 'End', type: 'end', x: 0, y: 0 },
        );
        this.flowNodes = nodes;

        this.flowEdges = [];
        if (loopType === 'for') {
            this.flowEdges.push({ from: 'start', to: 'init' });
            this.flowEdges.push({ from: 'init', to: 'check' });
        } else {
            this.flowEdges.push({ from: 'start', to: 'check' });
        }
        this.flowEdges.push({ from: 'check', to: 'body', label: 'true' });
        this.flowEdges.push({ from: 'body', to: 'check' });
        this.flowEdges.push({ from: 'check', to: 'end', label: 'false' });
    }

    /**
     * Parse a FLOW command string.
     * Format: "start->process1->decision?->yes:processA->end"
     */
    private parseFlowCommand(cmd: string): void {
        this.clear();
        this.type = VisualizationType.FlowChart;

        const steps = cmd.split('->').map(s => s.trim());
        for (let i = 0; i < steps.length; i++) {
            let label = steps[i];
            let type: FlowNode['type'] = 'process';
            const id = `n${i}`;

            if (i === 0) type = 'start';
            else if (i === steps.length - 1 || label.toLowerCase() === 'end') type = 'end';
            else if (label.endsWith('?')) { type = 'decision'; label = label.slice(0, -1); }

            // Check for branch label (yes:label or no:label)
            const colonIdx = label.indexOf(':');
            let edgeLabel: string | undefined;
            if (colonIdx > 0 && i > 0) {
                edgeLabel = label.substring(0, colonIdx);
                label = label.substring(colonIdx + 1);
            }

            this.flowNodes.push({ id, label, type, x: 0, y: 0 });

            if (i > 0) {
                this.flowEdges.push({ from: `n${i - 1}`, to: id, label: edgeLabel });
            }
        }
    }

    /**
     * Parse a CLASS command string.
     * Format: "ClassName:+health:int,+name:string|+update():void,+draw():void"
     */
    private parseClassCommand(cmd: string): void {
        // Don't clear — allow adding multiple classes
        this.type = VisualizationType.ClassDiagram;

        const firstColon = cmd.indexOf(':');
        if (firstColon === -1) return;

        const name = cmd.substring(0, firstColon);
        const rest = cmd.substring(firstColon + 1);

        // Split members|methods
        const [memberStr, methodStr] = rest.split('|');

        const members = (memberStr || '').split(',').filter(Boolean).map(m => {
            const vis = m.charAt(0);
            const eqIdx = m.lastIndexOf(':');
            return {
                visibility: vis === '+' || vis === '-' || vis === '#' ? vis : '+',
                name: eqIdx > 1 ? m.substring(1, eqIdx) : m.substring(1),
                type: eqIdx > 1 ? m.substring(eqIdx + 1) : 'int',
            };
        });

        const methods = (methodStr || '').split(',').filter(Boolean).map(m => {
            const vis = m.charAt(0);
            const parenIdx = m.indexOf('(');
            const colonIdx = m.lastIndexOf(':');
            return {
                visibility: vis === '+' || vis === '-' || vis === '#' ? vis : '+',
                name: parenIdx > 1 ? m.substring(1, parenIdx + m.substring(parenIdx).indexOf(')') + 1) : m.substring(1),
                returnType: colonIdx > parenIdx ? m.substring(colonIdx + 1) : 'void',
                params: '',
            };
        });

        const x = 50 + this.classBoxes.length * 220;
        this.classBoxes.push({ name, members, methods, x, y: 40 });
    }

    /**
     * Parse an INHERIT command string.
     * Format: "Child->Parent"
     */
    private parseInheritCommand(cmd: string): void {
        const parts = cmd.split('->').map(s => s.trim());
        if (parts.length >= 2) {
            this.classRelations.push({ from: parts[0], to: parts[1], type: 'inherits' });
        }
    }

    // ── FlowChart Renderer ──

    /**
     * Render a flow chart. Auto-layouts nodes top-to-bottom,
     * with decision branches going left/right.
     */
    private renderFlowChart(w: number, h: number): void {
        if (this.flowNodes.length === 0) return;
        if (!this.ctx) return;
        const ctx = this.ctx;

        // Auto-layout: main flow goes down the center, branches go left/right
        const nodeW = 120;
        const nodeH = 40;
        const vSpacing = 60;
        const centerX = w / 2;

        // Assign positions
        let y = 30;
        const positions = new Map<string, { x: number; y: number }>();
        const branchOffset = 160;
        let branchSide: 'left' | 'right' = 'left';

        for (const node of this.flowNodes) {
            // Check if this node is a branch target (has a labeled edge pointing to it)
            const incomingEdge = this.flowEdges.find(e => e.to === node.id && e.label);
            if (incomingEdge && incomingEdge.label === 'false') {
                // False branch goes to the right
                node.x = centerX + branchOffset - nodeW / 2;
                const parentPos = positions.get(incomingEdge.from);
                node.y = parentPos ? parentPos.y + vSpacing : y;
            } else if (incomingEdge && incomingEdge.label === 'true') {
                // True branch goes to the left
                node.x = centerX - branchOffset - nodeW / 2;
                const parentPos = positions.get(incomingEdge.from);
                node.y = parentPos ? parentPos.y + vSpacing : y;
            } else {
                node.x = centerX - nodeW / 2;
                node.y = y;
                y += vSpacing;
            }
            positions.set(node.id, { x: node.x + nodeW / 2, y: node.y + nodeH / 2 });
        }

        // Draw edges first (behind nodes)
        for (const edge of this.flowEdges) {
            const fromPos = positions.get(edge.from);
            const toPos = positions.get(edge.to);
            if (fromPos && toPos) {
                this.drawArrow(fromPos.x, fromPos.y + nodeH / 2, toPos.x, toPos.y - nodeH / 2, COLORS.text);
                // Edge label
                if (edge.label) {
                    ctx.font = '10px "Segoe UI", sans-serif';
                    ctx.fillStyle = colorToCSS(COLORS.pointer);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const midX = (fromPos.x + toPos.x) / 2;
                    const midY = (fromPos.y + nodeH / 2 + toPos.y - nodeH / 2) / 2;
                    ctx.fillText(edge.label, midX + 12, midY);
                }
            }
        }

        // Draw nodes
        for (const node of this.flowNodes) {
            this.drawFlowNode(node, nodeW, nodeH);
        }
    }

    /**
     * Draw a single flow chart node.
     * Shape depends on type: start/end = rounded pill, process = rectangle,
     * decision = diamond, io = parallelogram.
     */
    private drawFlowNode(node: FlowNode, w: number, h: number): void {
        if (!this.ctx) return;
        const ctx = this.ctx;

        let fillColor: Color;
        switch (node.type) {
            case 'start': case 'end':
                fillColor = { r: 0.2, g: 0.5, b: 0.3, a: 1.0 }; break;
            case 'decision':
                fillColor = { r: 0.5, g: 0.3, b: 0.6, a: 1.0 }; break;
            case 'io':
                fillColor = { r: 0.3, g: 0.4, b: 0.6, a: 1.0 }; break;
            default:
                fillColor = COLORS.cell; break;
        }

        if (node.type === 'decision') {
            // Diamond shape
            const cx = node.x + w / 2;
            const cy = node.y + h / 2;
            ctx.fillStyle = colorToCSS(fillColor);
            ctx.beginPath();
            ctx.moveTo(cx, node.y - 5);
            ctx.lineTo(node.x + w + 10, cy);
            ctx.lineTo(cx, node.y + h + 5);
            ctx.lineTo(node.x - 10, cy);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = colorToCSS(COLORS.border);
            ctx.lineWidth = 1.5;
            ctx.stroke();
        } else if (node.type === 'start' || node.type === 'end') {
            // Pill shape (very rounded rect)
            this.drawBox(node.x, node.y, w, h, fillColor, COLORS.border, h / 2);
        } else {
            // Regular rectangle
            this.drawBox(node.x, node.y, w, h, fillColor, COLORS.border, 4);
        }

        // Label
        ctx.font = '11px "Segoe UI", sans-serif';
        ctx.fillStyle = colorToCSS(COLORS.text);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, node.x + w / 2, node.y + h / 2, w - 10);
    }

    // ── Class Diagram Renderer ──

    /**
     * Render UML-style class diagram boxes with inheritance arrows.
     */
    private renderClassDiagram(w: number, h: number): void {
        if (this.classBoxes.length === 0) return;
        if (!this.ctx) return;
        const ctx = this.ctx;

        // Draw class boxes
        for (const cls of this.classBoxes) {
            this.drawClassBox(cls);
        }

        // Draw relationships
        for (const rel of this.classRelations) {
            const fromBox = this.classBoxes.find(c => c.name === rel.from);
            const toBox = this.classBoxes.find(c => c.name === rel.to);
            if (fromBox && toBox) {
                const fromCx = fromBox.x + 100;
                const toCx = toBox.x + 100;
                const fromY = fromBox.y;
                const toY = toBox.y + this.getClassBoxHeight(toBox);

                if (rel.type === 'inherits') {
                    // Hollow triangle arrowhead
                    this.drawArrow(fromCx, fromY, toCx, toY, { r: 0.4, g: 0.7, b: 1.0, a: 1.0 });

                    // Label
                    ctx.font = '9px "Segoe UI", sans-serif';
                    ctx.fillStyle = colorToCSS(COLORS.address);
                    ctx.textAlign = 'center';
                    ctx.fillText('inherits', (fromCx + toCx) / 2 + 20, (fromY + toY) / 2);
                }
            }
        }
    }

    /**
     * Draw a single UML class box.
     * Three sections: name, members, methods.
     */
    private drawClassBox(cls: ClassBox): void {
        if (!this.ctx) return;
        const ctx = this.ctx;

        const boxW = 200;
        const lineH = 18;
        const headerH = 28;
        const memberH = Math.max(cls.members.length * lineH, lineH);
        const methodH = Math.max(cls.methods.length * lineH, lineH);
        const totalH = headerH + memberH + methodH + 8;

        // Background
        this.drawBox(cls.x, cls.y, boxW, totalH, COLORS.cell, COLORS.border, 4);

        // Header (class name)
        ctx.fillStyle = colorToCSS({ r: 0.25, g: 0.25, b: 0.35, a: 1.0 });
        ctx.beginPath();
        this.roundRect(cls.x, cls.y, boxW, headerH, 4);
        ctx.fill();

        ctx.font = 'bold 13px "Segoe UI", sans-serif';
        ctx.fillStyle = colorToCSS(COLORS.text);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cls.name, cls.x + boxW / 2, cls.y + headerH / 2);

        // Divider line
        ctx.strokeStyle = colorToCSS(COLORS.border);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cls.x, cls.y + headerH);
        ctx.lineTo(cls.x + boxW, cls.y + headerH);
        ctx.stroke();

        // Members
        let y = cls.y + headerH + 4;
        ctx.font = '11px "Cascadia Code", "Fira Code", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (const m of cls.members) {
            ctx.fillStyle = colorToCSS(COLORS.address);
            ctx.fillText(`${m.visibility} ${m.name}: ${m.type}`, cls.x + 8, y);
            y += lineH;
        }
        if (cls.members.length === 0) {
            ctx.fillStyle = colorToCSS(COLORS.address);
            ctx.fillText('  (no members)', cls.x + 8, y);
            y += lineH;
        }

        // Divider
        ctx.strokeStyle = colorToCSS(COLORS.border);
        ctx.beginPath();
        ctx.moveTo(cls.x, y + 2);
        ctx.lineTo(cls.x + boxW, y + 2);
        ctx.stroke();
        y += 6;

        // Methods
        for (const m of cls.methods) {
            ctx.fillStyle = colorToCSS({ r: 0.6, g: 0.8, b: 1.0, a: 1.0 });
            ctx.fillText(`${m.visibility} ${m.name}: ${m.returnType}`, cls.x + 8, y);
            y += lineH;
        }
        if (cls.methods.length === 0) {
            ctx.fillStyle = colorToCSS(COLORS.address);
            ctx.fillText('  (no methods)', cls.x + 8, y);
        }
    }

    /** Calculate the total height of a class box for layout. */
    private getClassBoxHeight(cls: ClassBox): number {
        const lineH = 18;
        const headerH = 28;
        const memberH = Math.max(cls.members.length * lineH, lineH);
        const methodH = Math.max(cls.methods.length * lineH, lineH);
        return headerH + memberH + methodH + 8;
    }

    /**
     * Draw a single memory cell: rounded box with label above, value inside,
     * and hex address below.
     *
     * Ported from Visualizer::DrawMemoryCell().
     */
    private drawMemoryCell(cell: MemoryCell, x: number, y: number,
                           width: number, height: number): void {
        if (!this.ctx) return;
        const ctx = this.ctx;

        const fillColor = cell.isHighlighted ? COLORS.highlight : cell.color;
        this.drawBox(x, y, width, height, fillColor, COLORS.border, 4);

        // Label (variable name) — above the box
        if (cell.label) {
            ctx.font = 'bold 12px "Segoe UI", sans-serif';
            ctx.fillStyle = colorToCSS(COLORS.text);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(cell.label, x + width / 2, y - 4);
        }

        // Value — inside the box
        if (cell.value) {
            ctx.font = '14px "Cascadia Code", "Fira Code", monospace';
            ctx.fillStyle = colorToCSS(COLORS.text);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cell.value, x + width / 2, y + height / 2);
        }

        // Address — below the box
        ctx.font = '10px "Cascadia Code", "Fira Code", monospace';
        ctx.fillStyle = colorToCSS(COLORS.address);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(hexAddr(cell.address), x + width / 2, y + height + 2);
    }

    /**
     * Draw a rounded rectangle with fill and border.
     * Ported from Visualizer::DrawBox().
     */
    private drawBox(x: number, y: number, w: number, h: number,
                    fill: Color, border: Color, radius: number): void {
        if (!this.ctx) return;
        const ctx = this.ctx;

        // Fill
        ctx.fillStyle = colorToCSS(fill);
        ctx.beginPath();
        this.roundRect(x, y, w, h, radius);
        ctx.fill();

        // Border
        ctx.strokeStyle = colorToCSS(border);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        this.roundRect(x, y, w, h, radius);
        ctx.stroke();
    }

    /**
     * Draw a rounded rectangle path.
     * Uses ctx.roundRect() if available (modern browsers), otherwise manual arcs.
     */
    private roundRect(x: number, y: number, w: number, h: number, r: number): void {
        if (!this.ctx) return;
        const ctx = this.ctx;

        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
        } else {
            // Fallback for older Electron versions
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.arcTo(x + w, y, x + w, y + r, r);
            ctx.lineTo(x + w, y + h - r);
            ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
            ctx.lineTo(x + r, y + h);
            ctx.arcTo(x, y + h, x, y + h - r, r);
            ctx.lineTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
        }
    }

    /**
     * Draw an arrow from one point to another.
     * Draws a line with a V-shaped arrowhead at the destination.
     *
     * Ported from Visualizer::DrawArrow().
     * The arrowhead math is identical to the original.
     */
    private drawArrow(fromX: number, fromY: number,
                      toX: number, toY: number, color: Color): void {
        if (!this.ctx) return;
        const ctx = this.ctx;

        ctx.strokeStyle = colorToCSS(color);
        ctx.lineWidth = 2;

        // Draw the line
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        // Draw the arrowhead
        const dx = toX - fromX;
        const dy = toY - fromY;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len > 0) {
            const ndx = dx / len;
            const ndy = dy / len;
            const arrowSize = 10;

            // Two points forming the V of the arrowhead
            // Same geometry as the original C++ (rotate ±30° from the line direction)
            const p1x = toX - arrowSize * (ndx + ndy * 0.5);
            const p1y = toY - arrowSize * (ndy - ndx * 0.5);
            const p2x = toX - arrowSize * (ndx - ndy * 0.5);
            const p2y = toY - arrowSize * (ndy + ndx * 0.5);

            ctx.beginPath();
            ctx.moveTo(toX, toY);
            ctx.lineTo(p1x, p1y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(toX, toY);
            ctx.lineTo(p2x, p2y);
            ctx.stroke();
        }
    }
}

// ── Singleton Instance ──

export const codeVisualizer = new CodeVisualizer();
