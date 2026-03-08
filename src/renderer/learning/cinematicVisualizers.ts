/**
 * cinematicVisualizers.ts — Canvas renderers for the InitD3D lesson
 *
 * Ported from the proof-of-concept lesson-vis.js into TypeScript.
 * Contains block-level visualizers (LESSON_VIS) and token-level
 * mini visualizers (LESSON_TOK_VIS).
 *
 * Each visualizer is a function(ctx, w, h, vals?) that draws onto a
 * 2D canvas context. The engine calls these during explanation panels
 * and token-explain mode. Animated visualizers are driven by
 * requestAnimationFrame via vizCtrl/tokVizCtrl.
 */

// ── Block-Level Visualizers ──
// Keyed by block ID. Called when the explanation panel for that block is shown.

export type BlockVisualizer = (c: CanvasRenderingContext2D, w: number, h: number, vals?: Record<string, any>) => void;
export type TokenVisualizer = (c: CanvasRenderingContext2D, w: number, h: number) => void;

export const LESSON_VIS: Record<string, BlockVisualizer> = {

    comment(c, w, h) {
        c.fillStyle = '#13131a'; c.fillRect(0, 0, w, h);
        c.save(); c.translate(w / 2, h / 2);
        c.strokeStyle = 'rgba(78,201,176,0.2)'; c.lineWidth = 2; c.strokeRect(-120, -70, 240, 140);
        c.fillStyle = 'rgba(78,201,176,0.04)'; c.fillRect(-120, -70, 240, 140);
        c.fillStyle = '#5c6370'; c.font = '18px JetBrains Mono'; c.textAlign = 'center'; c.fillText('/**', 0, -30);
        c.fillStyle = '#c8c8d0'; c.font = '16px Outfit'; c.fillText('Xbox 360 Minecraft', 0, -2); c.fillText('Spinning Block Demo', 0, 22);
        c.fillStyle = '#5c6370'; c.font = '18px JetBrains Mono'; c.fillText('*/', 0, 50);
        c.restore();
    },

    preproc(c, w, h, vals) {
        c.fillStyle = '#13131a'; c.fillRect(0, 0, w, h);
        const sw = vals?.sw ?? 1280;
        const sh = vals?.sh ?? 720;
        const ok = sw === 1280 && sh === 720;

        const margin = 30, topPad = 15;
        const maxW = w - margin * 2, maxH = h - topPad - 70;
        const aspect = sw / sh;
        let rw: number, rh: number;
        if (maxW / maxH > aspect) { rh = maxH; rw = rh * aspect; } else { rw = maxW; rh = rw / aspect; }
        const dx = (w - rw) / 2, dy = topPad;

        c.fillStyle = '#0a0a0e'; c.fillRect(dx - 4, dy - 4, rw + 8, rh + 8);
        c.strokeStyle = '#333340'; c.lineWidth = 2; c.strokeRect(dx - 4, dy - 4, rw + 8, rh + 8);

        const t = Date.now() * 0.001;
        const scanSpeed = 0.4;
        const progress = (t * scanSpeed) % 1.0;
        const pixSize = Math.max(2, Math.floor(rw / 64));
        const cols = Math.floor(rw / pixSize), rows = Math.floor(rh / pixSize);
        const filledPixRows = Math.floor(progress * rows);

        for (let py = 0; py < rows; py++) {
            for (let px = 0; px < cols; px++) {
                const x = dx + px * pixSize, y = dy + py * pixSize;
                if (py < filledPixRows || (py === filledPixRows && px < cols * ((progress * rows) % 1))) {
                    const ny = py / rows, nx = px / cols;
                    let r2: number, g: number, b: number;
                    if (ny < 0.45) { r2 = 30 + ny * 80; g = 40 + ny * 120 + nx * 20; b = 120 + ny * 180; }
                    else if (ny < 0.55) { r2 = 80 + nx * 30; g = 140 + nx * 20; b = 80; }
                    else { const noise = (Math.sin(px * 7.3 + py * 13.1) * 0.5 + 0.5) * 40; r2 = 80 + noise; g = 55 + noise * 0.6; b = 30 + noise * 0.3; }
                    c.fillStyle = `rgb(${Math.floor(r2)},${Math.floor(g)},${Math.floor(b)})`;
                    c.fillRect(x, y, pixSize - 0.5, pixSize - 0.5);
                } else {
                    c.fillStyle = 'rgba(10,10,18,0.8)';
                    c.fillRect(x, y, pixSize - 0.5, pixSize - 0.5);
                }
            }
        }

        const scanY = dy + filledPixRows * pixSize;
        if (scanY >= dy && scanY < dy + rh) {
            const grad = c.createLinearGradient(dx, scanY - 2, dx, scanY + 4);
            grad.addColorStop(0, 'rgba(78,201,176,0)'); grad.addColorStop(0.5, 'rgba(78,201,176,0.7)'); grad.addColorStop(1, 'rgba(78,201,176,0)');
            c.fillStyle = grad; c.fillRect(dx, scanY - 2, rw, 6);
            const scanX = dx + Math.floor(((progress * rows) % 1) * cols) * pixSize;
            c.fillStyle = '#fff'; c.fillRect(scanX, scanY, pixSize, pixSize);
            c.shadowColor = '#6fffe9'; c.shadowBlur = 8;
            c.fillStyle = '#6fffe9'; c.fillRect(scanX, scanY, pixSize, pixSize);
            c.shadowBlur = 0;
        }

        c.fillStyle = '#6fffe9'; c.font = 'bold 16px Outfit'; c.textAlign = 'center';
        c.fillText(sw + ' \u00d7 ' + sh + ' pixels', w / 2, dy + rh + 22);
        c.fillStyle = ok ? '#4ec9b0' : '#e06c75'; c.font = '12px Outfit';
        c.fillText(ok ? '720p HD \u2014 Standard Xbox 360 Output' : 'Non-standard resolution', w / 2, dy + rh + 42);
        const totalPx = (sw * sh).toLocaleString();
        const drawnPx = Math.floor(progress * sw * sh).toLocaleString();
        c.fillStyle = '#555566'; c.font = '11px JetBrains Mono';
        c.fillText(drawnPx + ' / ' + totalPx + ' pixels drawn', w / 2, dy + rh + 58);
    },

    globals(c, w, h) {
        c.fillStyle = '#13131a'; c.fillRect(0, 0, w, h);
        const boxes = [
            { l: 'g_pD3D', s: 'Interface', clr: '#56d4f5', desc: 'Factory' },
            { l: 'g_pDevice', s: 'Device', clr: '#61afef', desc: 'GPU Handle' },
            { l: 'g_pVB', s: 'VB', clr: '#c678dd', desc: 'Geometry' },
            { l: 'g_pTexture', s: 'Texture', clr: '#e5c07b', desc: 'Dirt Block' },
        ];
        const margin = 20, n = boxes.length;
        const availW = w - margin * 2;
        const gap = Math.min(20, Math.floor(availW * 0.03));
        const bw = Math.floor((availW - (n - 1) * gap) / n);
        const bh = Math.min(75, Math.floor(h * 0.35));
        const total = n * bw + (n - 1) * gap;
        const sx = (w - total) / 2, sy = h / 2 - bh / 2 - 10;
        const fontSize = Math.max(8, Math.min(12, Math.floor(bw / 9)));
        boxes.forEach((b, i) => {
            const x = sx + i * (bw + gap);
            c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, sy, bw, bh);
            c.strokeStyle = b.clr; c.lineWidth = 2; c.strokeRect(x, sy, bw, bh);
            c.fillStyle = b.clr; c.font = 'bold ' + fontSize + 'px JetBrains Mono'; c.textAlign = 'center'; c.fillText(b.l, x + bw / 2, sy + bh * 0.37);
            c.fillStyle = '#555566'; c.font = fontSize + 'px Outfit'; c.fillText(b.desc, x + bw / 2, sy + bh * 0.63);
            c.fillStyle = 'rgba(224,108,117,0.6)'; c.font = (fontSize - 2) + 'px JetBrains Mono'; c.fillText('nullptr', x + bw / 2, sy + bh + 16);
            if (i < n - 1) {
                const ax = x + bw + 2, ay = sy + bh / 2;
                c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 2; c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + gap - 4, ay); c.stroke();
                c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.moveTo(ax + gap - 4, ay - 5); c.lineTo(ax + gap - 4, ay + 5); c.lineTo(ax + gap + 3, ay); c.fill();
            }
        });
        c.fillStyle = '#555566'; c.font = Math.max(10, fontSize) + 'px Outfit'; c.textAlign = 'center'; c.fillText('All pointers initialized to nullptr \u2014 set during InitD3D()', w / 2, sy + bh + 38);
    },

    vertex(c, w, h) {
        c.fillStyle = '#13131a'; c.fillRect(0, 0, w, h);
        const margin = Math.max(16, Math.floor(w * 0.06));
        const bx = margin, by = Math.max(30, Math.floor(h * 0.15)), bw = w - margin * 2;
        const fontSize = Math.max(10, Math.min(14, Math.floor(w / 32)));
        c.fillStyle = '#888'; c.font = 'bold ' + fontSize + 'px Outfit'; c.textAlign = 'left'; c.fillText('Memory Layout per Vertex:', bx, by - 12);
        const pw = bw * 0.667;
        c.fillStyle = 'rgba(97,175,239,0.12)'; c.fillRect(bx, by, pw, 60); c.strokeStyle = '#61afef'; c.lineWidth = 2; c.strokeRect(bx, by, pw, 60);
        c.fillStyle = '#61afef'; c.font = 'bold ' + fontSize + 'px JetBrains Mono'; c.textAlign = 'center'; c.fillText('float4 pos : POSITION', bx + pw / 2, by + 28);
        c.fillStyle = '#555566'; c.font = (fontSize - 2) + 'px Outfit'; c.fillText('16 bytes (x, y, z, w)', bx + pw / 2, by + 48);
        const uw = bw * 0.333;
        c.fillStyle = 'rgba(229,192,123,0.12)'; c.fillRect(bx + pw, by, uw, 60); c.strokeStyle = '#e5c07b'; c.lineWidth = 2; c.strokeRect(bx + pw, by, uw, 60);
        c.fillStyle = '#e5c07b'; c.font = 'bold ' + fontSize + 'px JetBrains Mono'; c.fillText('float2 uv', bx + pw + uw / 2, by + 28);
        c.fillStyle = '#555566'; c.font = (fontSize - 2) + 'px Outfit'; c.fillText('8 bytes (u, v)', bx + pw + uw / 2, by + 48);
        c.fillStyle = '#4ec9b0'; c.font = 'bold ' + fontSize + 'px Outfit'; c.textAlign = 'center'; c.fillText('Total: 24 bytes per vertex', w / 2, by + 85);
        const uvMaxSize = Math.min(Math.floor(w * 0.25), Math.floor(h - by - 115));
        const uvs = Math.max(50, uvMaxSize);
        const uvx = w / 2 - uvs / 2, uvy = by + 100;
        c.strokeStyle = 'rgba(229,192,123,0.3)'; c.lineWidth = 1.5; c.strokeRect(uvx, uvy, uvs, uvs);
        c.strokeStyle = 'rgba(229,192,123,0.1)';
        for (let g = 1; g < 4; g++) { c.beginPath(); c.moveTo(uvx + uvs * g / 4, uvy); c.lineTo(uvx + uvs * g / 4, uvy + uvs); c.stroke(); c.beginPath(); c.moveTo(uvx, uvy + uvs * g / 4); c.lineTo(uvx + uvs, uvy + uvs * g / 4); c.stroke(); }
        c.fillStyle = 'rgba(152,195,121,0.15)'; c.fillRect(uvx, uvy, uvs, uvs);
        c.fillStyle = '#98c379'; c.font = '11px JetBrains Mono'; c.textAlign = 'left'; c.fillText('(0,0)', uvx - 2, uvy - 6); c.textAlign = 'right'; c.fillText('(1,1)', uvx + uvs + 2, uvy + uvs + 14);
        const labelY = Math.min(uvy + uvs + 34, h - 6);
        c.fillStyle = '#555566'; c.font = (fontSize - 2) + 'px Outfit'; c.textAlign = 'center'; c.fillText('UV Space \u2192 Texture Mapping', w / 2, labelY);
    },

    fn_open(c, w, h) {
        c.fillStyle = '#13131a'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.001;
        const cx = w / 2, cy = h / 2 - 20;
        c.fillStyle = '#1a1a2a'; c.fillRect(cx - 80, cy - 35, 160, 70);
        c.strokeStyle = '#4ec9b0'; c.lineWidth = 2.5; c.strokeRect(cx - 80, cy - 35, 160, 70);
        c.fillStyle = '#4ec9b0'; c.font = 'bold 16px JetBrains Mono'; c.textAlign = 'center'; c.fillText('InitD3D()', cx, cy - 8);
        c.fillStyle = '#555'; c.font = '12px Outfit'; c.fillText('void \u2192 HRESULT', cx, cy + 15);
        c.strokeStyle = '#888'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(cx - 80, cy - 10); c.lineTo(cx - 110, cy - 25); c.stroke();
        c.beginPath(); c.moveTo(cx - 80, cy + 10); c.lineTo(cx - 110, cy + 25); c.stroke();
        c.fillStyle = '#888'; c.font = '11px Outfit'; c.fillText('\u2205 void', cx - 130, cy + 5);
        const pulse = 0.5 + Math.sin(t * 3) * 0.5;
        c.strokeStyle = 'rgba(78,201,176,' + (0.5 + pulse * 0.3) + ')'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(cx + 80, cy); c.lineTo(cx + 120, cy); c.stroke();
        c.beginPath(); c.moveTo(cx + 115, cy - 5); c.lineTo(cx + 120, cy); c.lineTo(cx + 115, cy + 5); c.stroke();
        c.fillStyle = '#4ec9b0'; c.font = '11px Outfit'; c.fillText('HRESULT', cx + 145, cy + 5);
        [cx - 80, cx + 80].forEach(gx => {
            const ga = t * 2;
            for (let i = 0; i < 8; i++) { const a = ga + i * Math.PI / 4; c.strokeStyle = 'rgba(78,201,176,0.3)'; c.lineWidth = 2; c.beginPath(); c.moveTo(gx + Math.cos(a) * 10, cy + Math.sin(a) * 10); c.lineTo(gx + Math.cos(a) * 18, cy + Math.sin(a) * 18); c.stroke(); }
            c.beginPath(); c.arc(gx, cy, 8, 0, Math.PI * 2); c.fillStyle = 'rgba(78,201,176,0.2)'; c.fill(); c.strokeStyle = '#4ec9b0'; c.lineWidth = 1; c.stroke();
        });
        c.fillStyle = '#555566'; c.font = '12px Outfit'; c.fillText('The function that initializes everything', cx, h - 15);
    },

    create9(c, w, h) {
        c.fillStyle = '#13131a'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.001;
        const cx = w / 2, cy = h / 2 - 15;
        const prog = ((t * 0.4) % 3);
        c.fillStyle = '#1a1a2a'; c.fillRect(20, cy - 30, 100, 60); c.strokeStyle = '#56d4f5'; c.lineWidth = 2; c.strokeRect(20, cy - 30, 100, 60);
        c.fillStyle = '#56d4f5'; c.font = 'bold 11px JetBrains Mono'; c.textAlign = 'center'; c.fillText('Direct3D', 70, cy - 8); c.fillText('Create9()', 70, cy + 8);
        const arrowProg = Math.min(1, prog / 1.5);
        const ax = 120 + arrowProg * (w - 240);
        c.strokeStyle = 'rgba(86,212,245,' + (0.5 + arrowProg * 0.3) + ')'; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(120, cy); c.lineTo(ax, cy); c.stroke();
        const filled = prog > 1.5;
        c.fillStyle = filled ? 'rgba(86,212,245,0.1)' : 'rgba(224,108,117,0.05)'; c.fillRect(w - 120, cy - 25, 100, 50);
        c.strokeStyle = filled ? '#56d4f5' : '#e06c75'; c.lineWidth = 2; c.strokeRect(w - 120, cy - 25, 100, 50);
        c.fillStyle = filled ? '#56d4f5' : '#e06c75'; c.font = 'bold 12px JetBrains Mono'; c.fillText(filled ? 'g_pD3D' : 'nullptr', w - 70, cy + 5);
        if (prog > 2) { c.fillStyle = '#98c379'; c.font = 'bold 11px Outfit'; c.fillText('\u2713 Not null \u2014 continue!', cx, cy + 50); }
        else if (prog > 1.5) { c.fillStyle = '#e5c07b'; c.font = '11px Outfit'; c.fillText('Checking: is g_pD3D null?', cx, cy + 50); }
        c.fillStyle = '#555566'; c.font = '12px Outfit'; c.fillText('Create \u2192 Store \u2192 Verify', cx, h - 15);
    },

    pp(c, w, h, vals) {
        c.fillStyle = '#13131a'; c.fillRect(0, 0, w, h);
        const vs = vals?.vsync !== undefined ? vals.vsync : true;
        const margin = Math.max(16, Math.floor(w * 0.04));
        const arrowW = Math.min(80, Math.floor(w * 0.15));
        const bw = Math.floor((w - margin * 2 - arrowW) / 2);
        const bh = Math.min(90, Math.floor(h * 0.35));
        const by = Math.max(20, Math.floor(h * 0.1));
        const bx = margin;
        const fs = Math.max(10, Math.min(14, Math.floor(bw / 14)));
        c.fillStyle = 'rgba(97,175,239,0.1)'; c.fillRect(bx, by, bw, bh); c.strokeStyle = '#61afef'; c.lineWidth = 2; c.strokeRect(bx, by, bw, bh);
        c.fillStyle = '#61afef'; c.font = 'bold ' + fs + 'px Outfit'; c.textAlign = 'center'; c.fillText('Back Buffer', bx + bw / 2, by + bh / 2 - 8);
        c.fillStyle = '#555566'; c.font = (fs - 2) + 'px Outfit'; c.fillText('A8R8G8B8 (32-bit)', bx + bw / 2, by + bh / 2 + 12);
        const arrX = bx + bw + Math.floor(arrowW * 0.1), ay = by + bh / 2;
        const arrowEnd = arrX + Math.floor(arrowW * 0.7);
        c.strokeStyle = '#4ec9b0'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(arrX, ay); c.lineTo(arrowEnd, ay); c.stroke();
        c.fillStyle = '#4ec9b0'; c.beginPath(); c.moveTo(arrowEnd, ay - 6); c.lineTo(arrowEnd, ay + 6); c.lineTo(arrowEnd + 9, ay); c.fill();
        c.fillStyle = '#4ec9b0'; c.font = 'bold ' + (fs - 4) + 'px Outfit'; c.fillText('DISCARD', arrX + (arrowEnd - arrX) / 2, ay - 12);
        const fx = bx + bw + arrowW;
        c.fillStyle = 'rgba(78,201,176,0.1)'; c.fillRect(fx, by, bw, bh); c.strokeStyle = '#4ec9b0'; c.lineWidth = 2; c.strokeRect(fx, by, bw, bh);
        c.fillStyle = '#4ec9b0'; c.font = 'bold ' + fs + 'px Outfit'; c.fillText('Front Buffer', fx + bw / 2, by + bh / 2 - 8);
        c.fillStyle = '#555566'; c.font = (fs - 2) + 'px Outfit'; c.fillText('\u2192 Display', fx + bw / 2, by + bh / 2 + 12);
        const dy2 = by + bh + 16;
        c.fillStyle = 'rgba(198,120,221,0.1)'; c.fillRect(bx, dy2, bw, 36); c.strokeStyle = '#c678dd'; c.lineWidth = 1.5; c.strokeRect(bx, dy2, bw, 36);
        c.fillStyle = '#c678dd'; c.font = (fs - 1) + 'px Outfit'; c.fillText('Depth: D24S8', bx + bw / 2, dy2 + 22);
        const vy = Math.min(dy2 + 52, h - 30);
        c.fillStyle = vs ? '#4ec9b0' : '#e06c75'; c.font = 'bold ' + fs + 'px Outfit'; c.textAlign = 'center';
        c.fillText(vs ? 'VSync ON \u2014 Locked 60fps' : 'VSync OFF \u2014 Tearing possible', w / 2, vy);
        const barW = Math.floor((w - margin * 2) / 8);
        for (let i = 0; i < 8; i++) {
            const x = margin + i * (barW + 2);
            c.fillStyle = vs ? 'rgba(78,201,176,0.15)' : 'rgba(224,108,117,0.15)'; c.fillRect(x, vy + 10, barW - 2, 8);
            c.fillStyle = vs ? 'rgba(78,201,176,0.5)' : 'rgba(224,108,117,0.5)'; c.fillRect(x, vy + 10, vs ? (barW - 2) : (Math.floor(barW * 0.4) + Math.random() * barW * 0.5), 8);
        }
    },

    createdev(c, w, h) {
        c.fillStyle = '#13131a'; c.fillRect(0, 0, w, h);
        const steps = [
            { l: 'Direct3DCreate9', s: 'Create Interface', clr: '#56d4f5' },
            { l: 'Configure PP', s: 'Set Parameters', clr: '#c678dd' },
            { l: 'CreateDevice', s: 'Get GPU Handle', clr: '#61afef' },
            { l: 'READY', s: 'Begin Rendering', clr: '#4ec9b0' },
        ];
        const margin = 16, n = steps.length;
        const availPW = w - margin * 2;
        const gap = Math.min(16, Math.floor(availPW * 0.025));
        const bw = Math.floor((availPW - (n - 1) * gap) / n);
        const bh = Math.min(50, Math.floor(h * 0.18));
        const total = n * bw + (n - 1) * gap;
        const sx = (w - total) / 2, sy = 20;
        const fs = Math.max(7, Math.min(10, Math.floor(bw / 12)));
        steps.forEach((s, i) => {
            const x = sx + i * (bw + gap);
            c.fillStyle = s.clr + '18'; c.fillRect(x, sy, bw, bh); c.strokeStyle = s.clr; c.lineWidth = 2; c.strokeRect(x, sy, bw, bh);
            c.fillStyle = s.clr; c.font = 'bold ' + fs + 'px JetBrains Mono'; c.textAlign = 'center'; c.fillText(s.l, x + bw / 2, sy + bh * 0.44);
            c.fillStyle = '#555566'; c.font = (fs + 1) + 'px Outfit'; c.fillText(s.s, x + bw / 2, sy + bh * 0.8);
            if (i < steps.length - 1) {
                const ax = x + bw + 2, ay2 = sy + bh / 2;
                c.strokeStyle = '#ffffff22'; c.lineWidth = 2; c.beginPath(); c.moveTo(ax, ay2); c.lineTo(ax + gap - 3, ay2); c.stroke();
                c.fillStyle = '#ffffff22'; c.beginPath(); c.moveTo(ax + gap - 3, ay2 - 5); c.lineTo(ax + gap - 3, ay2 + 5); c.lineTo(ax + gap + 3, ay2); c.fill();
            }
        });
        c.fillStyle = '#4ec9b0'; c.font = 'bold 13px Outfit'; c.textAlign = 'center'; c.fillText('Device Ready \u2014 Rendering Preview', w / 2, h - 12);

        // Spinning Minecraft dirt cube
        const cx0 = w / 2, cy0 = Math.max(sy + bh + 80, Math.floor(h * 0.55)), R = Math.min(60, Math.floor(h * 0.2));
        const verts = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
        const faces = [
            { idx: [0, 1, 2, 3], clr: '#6B4C2A' },
            { idx: [4, 5, 6, 7], clr: '#8B6914' },
            { idx: [0, 1, 5, 4], clr: '#5A3D1A' },
            { idx: [2, 3, 7, 6], clr: '#4EC960' },
            { idx: [0, 3, 7, 4], clr: '#7B5B2A' },
            { idx: [1, 2, 6, 5], clr: '#9B7B3A' },
        ];

        const t = Date.now() * 0.001;
        const ayR = t * 0.8, axR = t * 0.5;
        const cay = Math.cos(ayR), say = Math.sin(ayR), cax = Math.cos(axR), sax = Math.sin(axR);

        function proj(p: number[]) {
            let x = p[0] * cay - p[2] * say, z = p[0] * say + p[2] * cay, y = p[1];
            const y2 = y * cax - z * sax, z2 = y * sax + z * cax;
            const sc = R / (2.8 + z2 * 0.35);
            return { x: x * sc + cx0, y: y2 * sc + cy0, z: z2 };
        }

        const projected = verts.map(v => proj(v));
        const sortedFaces = faces.map(f => {
            const avgZ = f.idx.reduce((s, vi) => s + projected[vi].z, 0) / 4;
            return { f, avgZ };
        }).sort((a, b) => a.avgZ - b.avgZ);

        // Clear cube area
        c.fillStyle = '#13131a'; c.fillRect(0, 80, w, h - 100);
        c.fillStyle = '#4ec9b0'; c.font = 'bold 13px Outfit'; c.textAlign = 'center'; c.fillText('Device Ready \u2014 Rendering Preview', w / 2, h - 12);

        sortedFaces.forEach(({ f }) => {
            const pts = f.idx.map(i => projected[i]);
            const avgZ = f.idx.reduce((s, vi) => s + projected[vi].z, 0) / 4;
            const bright = 0.45 + 0.35 * ((avgZ + 1.5) / 3);
            c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < 4; i++) c.lineTo(pts[i].x, pts[i].y);
            c.closePath();
            const hex = f.clr;
            const r2 = parseInt(hex.slice(1, 3), 16), g2 = parseInt(hex.slice(3, 5), 16), b2 = parseInt(hex.slice(5, 7), 16);
            c.fillStyle = `rgb(${Math.round(r2 * bright)},${Math.round(g2 * bright)},${Math.round(b2 * bright)})`;
            c.fill();
            c.save(); c.clip();
            const grid = 4;
            for (let gy = 0; gy < grid; gy++) {
                for (let gx = 0; gx < grid; gx++) {
                    const u = (gx + 0.5) / grid, v = (gy + 0.5) / grid;
                    const tx = pts[0].x * (1 - u) * (1 - v) + pts[1].x * u * (1 - v) + pts[2].x * u * v + pts[3].x * (1 - u) * v;
                    const ty = pts[0].y * (1 - u) * (1 - v) + pts[1].y * u * (1 - v) + pts[2].y * u * v + pts[3].y * (1 - u) * v;
                    const noise = ((gx * 7 + gy * 13 + hex.charCodeAt(1)) % 5) * 0.04;
                    c.fillStyle = hex === '#4EC960' ? `rgba(30,140,50,${0.15 + noise})` : `rgba(0,0,0,${0.08 + noise})`;
                    c.fillRect(tx - 3, ty - 3, 6, 6);
                }
            }
            c.restore();
            c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1; c.stroke();
        });
    },
};

// ── Token-Level Mini Visualizers ──
// Keyed by the exact token text. Called during token-explain mode.

export const LESSON_TOK_VIS: Record<string, TokenVisualizer> = {

    'ZeroMemory'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.002;
        const cells = 12, cw = Math.floor((w - 20) / cells), ch = 16;
        const bx2 = 10, by2 = Math.max(10, Math.floor(h / 2 - ch / 2 - 8));
        const prog = Math.floor(((t % 2) / 2) * cells);
        for (let i = 0; i < cells; i++) {
            const x = bx2 + i * cw;
            const zeroed = i < prog;
            c.fillStyle = zeroed ? 'rgba(78,201,176,0.12)' : 'rgba(224,108,117,0.08)'; c.fillRect(x, by2, cw - 2, ch);
            c.strokeStyle = zeroed ? '#4ec9b0' : '#e06c75'; c.lineWidth = 1; c.strokeRect(x, by2, cw - 2, ch);
            c.fillStyle = zeroed ? '#4ec9b0' : '#e06c75'; c.font = 'bold 8px JetBrains Mono'; c.textAlign = 'center'; c.fillText(zeroed ? '00' : '??', x + cw / 2 - 1, by2 + ch / 2 + 3);
        }
        const sx = bx2 + (prog + ((t % 2) * cells - prog)) * cw;
        c.fillStyle = 'rgba(111,255,233,0.25)'; c.fillRect(sx - 1, by2 - 2, cw + 2, ch + 4);
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.textAlign = 'center'; c.fillText('Wipes garbage data to clean zeros', w / 2, h - 12);
    },

    '&pp'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.002, cx = w / 2, cy = h / 2 - 5;
        c.fillStyle = '#1a1a2a'; c.fillRect(cx - 25, cy - 10, 50, 20); c.strokeStyle = '#4ec9b0'; c.lineWidth = 1.5; c.strokeRect(cx - 25, cy - 10, 50, 20);
        c.fillStyle = '#4ec9b0'; c.font = 'bold 10px JetBrains Mono'; c.textAlign = 'center'; c.fillText('pp', cx, cy + 4);
        const addr = '0x' + Math.floor(t * 100 % 65535).toString(16).toUpperCase().padStart(4, '0');
        c.fillStyle = '#e5c07b'; c.font = '8px JetBrains Mono'; c.fillText('addr: ' + addr, cx, cy - 15);
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.fillText('"Address of" \u2014 where pp lives in memory', w / 2, h - 12);
    },

    'sizeof(pp)'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.002, cx = w / 2, cy = h / 2 - 3, tw = w - 30;
        c.fillStyle = 'rgba(229,192,123,0.08)'; c.fillRect(15, cy - 8, tw, 16); c.strokeStyle = '#e5c07b'; c.lineWidth = 1; c.strokeRect(15, cy - 8, tw, 16);
        const prog = Math.min(1, ((t % 2) / 1.2));
        c.fillStyle = 'rgba(229,192,123,0.25)'; c.fillRect(15, cy - 6, tw * prog, 12);
        c.fillStyle = '#e5c07b'; c.font = 'bold 10px Outfit'; c.textAlign = 'center'; c.fillText(Math.floor(prog * 56) + ' bytes', cx, cy + 4);
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.fillText('Measures how many bytes pp uses', w / 2, h - 12);
    },

    'pp.BackBufferWidth'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.003, prog = Math.min(1, ((t % 2) / 0.8));
        c.fillStyle = 'rgba(78,201,176,0.04)'; c.fillRect(10, 12, w - 20, 25); c.strokeStyle = '#4ec9b0'; c.lineWidth = 1; c.strokeRect(10, 12, w - 20, 25);
        c.fillStyle = '#888'; c.font = '8px Outfit'; c.textAlign = 'left'; c.fillText('BackBufferWidth:', 15, 28);
        c.fillStyle = '#6fffe9'; c.font = 'bold 11px JetBrains Mono'; c.textAlign = 'right'; c.fillText(Math.floor(prog * 1280) + 'px', w - 15, 28);
        c.fillStyle = 'rgba(78,201,176,0.2)'; c.fillRect(10, 40, (w - 20) * prog, 5);
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.textAlign = 'center'; c.fillText('Setting horizontal pixel count', w / 2, h - 12);
    },

    'D3DFMT_A8R8G8B8'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.002;
        const channels = [
            { l: 'A', c: '#aaa', v: 255 },
            { l: 'R', c: '#e06c75', v: Math.floor(128 + Math.sin(t) * 127) },
            { l: 'G', c: '#98c379', v: Math.floor(128 + Math.sin(t + 2) * 127) },
            { l: 'B', c: '#61afef', v: Math.floor(128 + Math.sin(t + 4) * 127) },
        ];
        const cbw = Math.floor((w - 35) / 4), bh2 = 28, bx2 = 8;
        channels.forEach((ch, i) => {
            const x = bx2 + i * (cbw + 5), fill = ch.v / 255;
            c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, 8, cbw, bh2);
            c.fillStyle = ch.c + '33'; c.fillRect(x, 8 + bh2 * (1 - fill), cbw, bh2 * fill);
            c.strokeStyle = ch.c; c.lineWidth = 1; c.strokeRect(x, 8, cbw, bh2);
            c.fillStyle = ch.c; c.font = 'bold 8px Outfit'; c.textAlign = 'center'; c.fillText(ch.l, x + cbw / 2, 7);
            c.fillStyle = '#ccc'; c.font = '7px JetBrains Mono'; c.fillText(String(ch.v), x + cbw / 2, 8 + bh2 + 10);
        });
        const preview = 'rgb(' + channels[1].v + ',' + channels[2].v + ',' + channels[3].v + ')';
        c.fillStyle = preview; c.fillRect(w / 2 - 12, bh2 + 24, 24, 8);
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.textAlign = 'center'; c.fillText('32 bits per pixel = 16M colors', w / 2, h - 12);
    },

    'D3DSWAPEFFECT_DISCARD'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.003, phase = (t % 2);
        c.fillStyle = 'rgba(78,201,176,0.08)'; c.fillRect(10, 8, 45, 30); c.strokeStyle = '#4ec9b0'; c.lineWidth = 1; c.strokeRect(10, 8, 45, 30);
        c.fillStyle = '#4ec9b0'; c.font = 'bold 8px Outfit'; c.textAlign = 'center'; c.fillText('BACK', 32, 26);
        c.fillStyle = 'rgba(97,175,239,0.08)'; c.fillRect(w - 55, 8, 45, 30); c.strokeStyle = '#61afef'; c.lineWidth = 1; c.strokeRect(w - 55, 8, 45, 30);
        c.fillStyle = '#61afef'; c.fillText('FRONT', w - 32, 26);
        if (phase < 1) {
            const prog = phase, arrX = 55 + prog * (w - 110);
            c.strokeStyle = '#e5c07b'; c.lineWidth = 2; c.beginPath(); c.moveTo(55, 23); c.lineTo(arrX, 23); c.stroke();
            c.beginPath(); c.moveTo(arrX - 4, 19); c.lineTo(arrX, 23); c.lineTo(arrX - 4, 27); c.stroke();
        } else {
            c.strokeStyle = '#e06c75'; c.lineWidth = 2; c.beginPath(); c.moveTo(15, 12); c.lineTo(50, 34); c.stroke(); c.beginPath(); c.moveTo(50, 12); c.lineTo(15, 34); c.stroke();
        }
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.textAlign = 'center'; c.fillText('Show new frame, discard old', w / 2, h - 12);
    },

    'D3DPRESENT_INTERVAL_ONE'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.002;
        c.strokeStyle = 'rgba(97,175,239,0.4)'; c.lineWidth = 1.5; c.beginPath();
        for (let x = 8; x < w - 8; x++) { const y = 20 + Math.sin((x + t * 60) * 0.05) * 10; x === 8 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke();
        c.fillStyle = '#61afef'; c.font = '7px Outfit'; c.textAlign = 'left'; c.fillText('TV', 10, 10);
        c.strokeStyle = 'rgba(78,201,176,0.4)'; c.lineWidth = 1.5; c.beginPath();
        for (let x2 = 8; x2 < w - 8; x2++) { const y2 = 48 + Math.sin((x2 + t * 60) * 0.05) * 10; x2 === 8 ? c.moveTo(x2, y2) : c.lineTo(x2, y2); } c.stroke();
        c.fillStyle = '#4ec9b0'; c.font = '7px Outfit'; c.fillText('GPU', 10, 40);
        for (let i = 0; i < 4; i++) {
            const x3 = 25 + i * ((w - 50) / 3);
            c.strokeStyle = 'rgba(229,192,123,0.25)'; c.lineWidth = 1; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(x3, 10); c.lineTo(x3, 60); c.stroke(); c.setLineDash([]);
        }
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.textAlign = 'center'; c.fillText('Syncs to TV \u2014 no tearing', w / 2, h - 12);
    },

    'return'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.003, cx = w / 2, by = 10, bh2 = h - 25;
        c.fillStyle = '#1a1a2a'; c.fillRect(15, by, w - 30, bh2); c.strokeStyle = '#4ec9b0'; c.lineWidth = 1.5; c.strokeRect(15, by, w - 30, bh2);
        const prog = (t % 1.5) / 1.5, ay = by + bh2 - prog * bh2;
        c.fillStyle = 'rgba(78,201,176,' + (0.7 - prog * 0.4) + ')'; c.beginPath(); c.moveTo(cx - 6, ay); c.lineTo(cx, ay - 10); c.lineTo(cx + 6, ay); c.closePath(); c.fill();
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.textAlign = 'center'; c.fillText('Sends result back to caller', w / 2, h - 12);
    },

    'g_pD3D->CreateDevice'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.002, cx = w / 2, cy = h / 2 - 5, pulse = 0.5 + Math.sin(t * 3) * 0.5;
        c.fillStyle = '#1a1a2a'; c.fillRect(8, cy - 12, 48, 24); c.strokeStyle = '#56d4f5'; c.lineWidth = 1.5; c.strokeRect(8, cy - 12, 48, 24);
        c.fillStyle = '#56d4f5'; c.font = 'bold 8px JetBrains Mono'; c.textAlign = 'center'; c.fillText('g_pD3D', 32, cy + 4);
        c.strokeStyle = 'rgba(229,192,123,' + (0.4 + pulse * 0.3) + ')'; c.lineWidth = 2; c.beginPath(); c.moveTo(56, cy); c.lineTo(w - 62, cy); c.stroke();
        c.fillStyle = '#e5c07b'; c.font = 'bold 9px Outfit'; c.fillText('->', cx, cy - 7);
        c.fillStyle = '#1a1a2a'; c.fillRect(w - 60, cy - 14, 52, 28); c.strokeStyle = '#4ec9b0'; c.lineWidth = 2;
        c.shadowColor = 'rgba(78,201,176,' + pulse * 0.4 + ')'; c.shadowBlur = 6; c.strokeRect(w - 60, cy - 14, 52, 28); c.shadowBlur = 0;
        c.fillStyle = '#4ec9b0'; c.font = 'bold 7px JetBrains Mono'; c.fillText('Create', w - 34, cy - 2); c.fillText('Device', w - 34, cy + 9);
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.fillText('Calls function through pointer', w / 2, h - 12);
    },

    '0'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2 - 5;
        c.fillStyle = '#1a1a2a'; c.fillRect(cx - 25, cy - 12, 50, 24); c.strokeStyle = '#61afef'; c.lineWidth = 2; c.strokeRect(cx - 25, cy - 12, 50, 24);
        c.fillStyle = '#61afef'; c.font = 'bold 11px JetBrains Mono'; c.textAlign = 'center'; c.fillText('GPU 0', cx, cy + 4);
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.fillText('Primary (only) graphics adapter', w / 2, h - 12);
    },

    'D3DDEVTYPE_HAL'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.002, cy = h / 2 - 8, phase = Math.floor(t * 0.8) % 2;
        c.fillStyle = phase === 0 ? 'rgba(78,201,176,0.12)' : 'rgba(78,201,176,0.03)'; c.fillRect(10, cy - 15, w / 2 - 18, 30);
        c.strokeStyle = phase === 0 ? '#4ec9b0' : '#444'; c.lineWidth = 1.5; c.strokeRect(10, cy - 15, w / 2 - 18, 30);
        c.fillStyle = phase === 0 ? '#4ec9b0' : '#666'; c.font = 'bold 9px JetBrains Mono'; c.textAlign = 'center'; c.fillText('HAL', 10 + (w / 2 - 18) / 2, cy);
        c.fillStyle = phase === 0 ? '#4ec9b0' : '#666'; c.font = '7px Outfit'; c.fillText('FAST', 10 + (w / 2 - 18) / 2, cy + 12);
        c.fillStyle = phase === 1 ? 'rgba(224,108,117,0.12)' : 'rgba(224,108,117,0.03)'; c.fillRect(w / 2 + 8, cy - 15, w / 2 - 18, 30);
        c.strokeStyle = phase === 1 ? '#e06c75' : '#444'; c.lineWidth = 1.5; c.strokeRect(w / 2 + 8, cy - 15, w / 2 - 18, 30);
        c.fillStyle = phase === 1 ? '#e06c75' : '#666'; c.font = 'bold 9px JetBrains Mono'; c.fillText('REF', w / 2 + 8 + (w / 2 - 18) / 2, cy);
        c.fillStyle = phase === 1 ? '#e06c75' : '#666'; c.font = '7px Outfit'; c.fillText('SLOW', w / 2 + 8 + (w / 2 - 18) / 2, cy + 12);
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.fillText('Real GPU hardware vs software', w / 2, h - 12);
    },

    'D3DCREATE_HARDWARE_VERTEXPROCESSING'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.002, cy = h / 2 - 5;
        c.fillStyle = '#1a1a2a'; c.fillRect(8, cy - 12, 40, 24); c.strokeStyle = '#888'; c.lineWidth = 1; c.strokeRect(8, cy - 12, 40, 24);
        c.fillStyle = '#888'; c.font = 'bold 8px Outfit'; c.textAlign = 'center'; c.fillText('CPU', 28, cy + 4);
        c.fillStyle = '#1a1a2a'; c.fillRect(w - 48, cy - 12, 40, 24); c.strokeStyle = '#4ec9b0'; c.lineWidth = 2; c.strokeRect(w - 48, cy - 12, 40, 24);
        c.fillStyle = '#4ec9b0'; c.font = 'bold 8px Outfit'; c.fillText('GPU', w - 28, cy + 4);
        for (let i = 0; i < 3; i++) {
            const prog = ((t * 1.5 + i * 0.4) % 1.5) / 1.5, px = 48 + (w - 96) * prog;
            c.beginPath(); c.arc(px, cy, 3, 0, Math.PI * 2); c.fillStyle = 'rgba(78,201,176,' + (0.7 - prog * 0.3) + ')'; c.fill();
        }
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.fillText('GPU handles vertex math \u2014 much faster', w / 2, h - 12);
    },

    '&g_pDevice'(c, w, h) {
        c.fillStyle = '#0e0e14'; c.fillRect(0, 0, w, h);
        const t = Date.now() * 0.002, cx = w / 2, cy = h / 2 - 5;
        c.strokeStyle = '#61afef'; c.setLineDash([4, 4]); c.lineWidth = 1.5; c.strokeRect(cx - 35, cy - 12, 70, 24); c.setLineDash([]);
        c.fillStyle = 'rgba(97,175,239,0.06)'; c.fillRect(cx - 35, cy - 12, 70, 24);
        const filled2 = Math.sin(t * 2) > 0;
        c.fillStyle = filled2 ? '#61afef' : '#e06c75'; c.font = 'bold 9px JetBrains Mono'; c.textAlign = 'center';
        c.fillText(filled2 ? 'DEVICE' : 'nullptr', cx, cy + 4);
        const addr = '0x' + Math.floor(t * 80 % 65535).toString(16).toUpperCase().padStart(4, '0');
        c.fillStyle = '#e5c07b'; c.font = '8px JetBrains Mono'; c.fillText('&\u2192 ' + addr, cx, cy - 17);
        c.fillStyle = '#555'; c.font = '10px Outfit'; c.fillText('CreateDevice fills this slot for us', w / 2, h - 6);
    },
};
