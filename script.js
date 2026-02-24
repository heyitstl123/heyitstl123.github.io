/* ============================================================
   GROWING PLANTS IN SIMULATED MICROGRAVITY
   Enhanced with:
   - Animated star field hero
   - Improved biological realism (gravitropism THEN phototropism under gravity)
   - Auto-stop at maturity
   - Enhanced chart with toggles
   - Comparison mode
   - Locked hypothesis during experiment
   ============================================================ */

'use strict';

/* ============================================================
   PLANT VARIETY DEFINITIONS
   ============================================================ */
const VARIETIES = {
    cress: {
        label:          'Cress',
        stemWidth:      2.2,
        stemColor:      '#4a7c3f',
        maxStemLen:     240,
        growthRate:     0.055,
        branchChance:   0.28,
        branchSpread:   0.60,
        leafShape:      'oval',
        leafScale:      0.90,
        leafColor:      '#5aad4e',
        leafSpacing:    20,
        rootColor:      '#8B6914',
        rootWidth:      1.6,
        rootGrowthRate: 0.040,
        maxRootLen:     120,
    },
    bean: {
        label:          'Bean',
        stemWidth:      5.8,
        stemColor:      '#3a6e2f',
        maxStemLen:     300,
        growthRate:     0.030,
        branchChance:   0.10,
        branchSpread:   0.72,
        leafShape:      'broad',
        leafScale:      2.10,
        leafColor:      '#4d9440',
        leafSpacing:    36,
        rootColor:      '#7a5510',
        rootWidth:      3.8,
        rootGrowthRate:  0.025,
        maxRootLen:     160,
    },
    arabidopsis: {
        label:          'Arabidopsis',
        stemWidth:      1.7,
        stemColor:      '#5c8a50',
        maxStemLen:     190,
        growthRate:     0.048,
        branchChance:   0.38,
        branchSpread:   0.95,
        leafShape:      'lance',
        leafScale:      0.68,
        leafColor:      '#68b85c',
        leafSpacing:    15,
        rootColor:      '#9e7e20',
        rootWidth:      1.1,
        rootGrowthRate: 0.050,
        maxRootLen:     145,
    },
    wheat: {
        label:          'Wheat',
        stemWidth:      2.1,
        stemColor:      '#7a9040',
        maxStemLen:     280,
        growthRate:     0.042,
        branchChance:   0.05,
        branchSpread:   0.18,
        leafShape:      'narrow',
        leafScale:      1.15,
        leafColor:      '#8db855',
        leafSpacing:    28,
        rootColor:      '#a08830',
        rootWidth:      1.5,
        rootGrowthRate: 0.032,
        maxRootLen:     110,
    }
};

/* ============================================================
   APPLICATION STATE
   ============================================================ */
const App = {
    theme:         'light',
    isRunning:     false,
    isComplete:    false,
    startTime:     null,
    elapsedMs:     0,
    animId:        null,
    gravity:       0,
    lightDir:      'none',
    variety:       'cress',
    compareMode:   false,
    plant:         null,
    comparePlant:  null,
    dataPoints:    [],
    compareData:   [],
    camera: { scale: 1, targetScale: 1, panY: 0, targetPanY: 0 },
    chartToggles: { stemLength: true, rootDepth: true, stemAngle: false }
};

/* ============================================================
   HiDPI CANVAS HELPER
   ============================================================ */
function hiDPI(canvas) {
    const dpr  = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth  || parseInt(canvas.getAttribute('width'),  10) || 800;
    const cssH = canvas.clientHeight || parseInt(canvas.getAttribute('height'), 10) || 400;
    const physW = Math.round(cssW * dpr);
    const physH = Math.round(cssH * dpr);

    if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width        = physW;
        canvas.height       = physH;
        canvas.style.width  = cssW + 'px';
        canvas.style.height = cssH + 'px';
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: cssW, H: cssH };
}

/* ============================================================
   SEGMENT CLASS — with enhanced gravitropism/phototropism
   ============================================================ */
class Segment {
    constructor(x, y, angleDeg, generation, isRoot, variety) {
        this.x          = x;
        this.y          = y;
        this.angle      = angleDeg;
        this.generation = generation;
        this.isRoot     = isRoot;
        this.variety    = variety;

        const v         = VARIETIES[variety];
        const gf        = Math.pow(0.62, generation);
        const baseLen   = isRoot ? v.maxRootLen : v.maxStemLen;
        this.K          = baseLen * gf * (0.85 + Math.random() * 0.30);
        this.length     = 0.1;
        this.growing    = true;
        this.children   = [];
        this.branched   = false;
        this.leafAt     = [];
        this.curveDrift = (Math.random() - 0.5) * 0.35;
        this.baseWidth  = isRoot
            ? Math.max(v.rootWidth  * gf, 0.5)
            : Math.max(v.stemWidth  * gf, 0.7);
    }

    grow(gravity, lightDir) {
        if (this.growing) {
            const v  = VARIETIES[this.variety];
            const r  = this.isRoot ? v.rootGrowthRate : v.growthRate;

            // Logistic growth
            const dL = r * this.length * (1 - this.length / this.K);
            this.length = Math.min(this.length + dL, this.K);
            if (this.length >= this.K * 0.995) this.growing = false;

            this._applyTropism(gravity, lightDir);

            const spacing  = v.leafSpacing + Math.random() * 6;
            const lastLeaf = this.leafAt[this.leafAt.length - 1] ?? 0;
            if (this.length - lastLeaf > spacing) this.leafAt.push(this.length);

            if (!this.branched && this.generation < 3 &&
                this.length > this.K * 0.50 &&
                Math.random() < v.branchChance * 0.012) {
                this._branch();
                this.branched = true;
            }
        }
        for (const c of this.children) c.grow(gravity, lightDir);
    }

    _applyTropism(gravity, lightDir) {
        this.angle += this.curveDrift * 0.4;

        // GRAVITROPISM — dominant in early growth
        if (gravity > 0 && this.generation === 0) {
            const gravTarget  = this.isRoot ? 90 : -90;
            const diff        = angleDiff(gravTarget, this.angle);
            const maturity    = this.length / this.K;
            // Early in growth: strong gravitropism
            // Later: weaken to allow phototropism to take over
            const gravStrength = gravity * (1.2 - maturity * 0.7);
            this.angle += diff * gravStrength * 0.018;
        }

        // PHOTOTROPISM — increases influence as plant matures
        if (lightDir !== 'none') {
            const lightDeg = dirToDeg(lightDir);
            const target   = this.isRoot ? lightDeg + 180 : lightDeg;
            const diff     = angleDiff(target, this.angle);
            const maturity = this.length / this.K;

            if (maturity > 0.15) {
                // In microgravity: phototropism is immediate and strong
                // Under gravity: phototropism gradually increases with maturity
                const photoSpeed = gravity === 0
                    ? 0.80
                    : 0.05 + maturity * 0.40;  // starts weak, grows stronger
                this.angle += diff * photoSpeed * 0.018;
            }
        }

        // Random walk in microgravity with no light
        if (gravity === 0 && lightDir === 'none' && this.generation === 0) {
            this.angle += (Math.random() - 0.5) * 0.5;
        }
    }

    _branch() {
        const v   = VARIETIES[this.variety];
        const tip = this.tip();
        const s   = Math.random() < 0.5 ? 1 : -1;
        const a1  = this.angle + s  * (v.branchSpread * 0.55 + Math.random() * v.branchSpread * 0.35);
        this.children.push(
            new Segment(tip.x, tip.y, a1, this.generation + 1, this.isRoot, this.variety)
        );
        if (this.generation === 0 && Math.random() < 0.55) {
            const a2 = this.angle - s * (v.branchSpread * 0.45 + Math.random() * v.branchSpread * 0.35);
            this.children.push(
                new Segment(tip.x, tip.y, a2, this.generation + 1, this.isRoot, this.variety)
            );
        }
    }

    tip() {
        const rad = this.angle * Math.PI / 180;
        return {
            x: this.x + Math.cos(rad) * this.length,
            y: this.y + Math.sin(rad) * this.length
        };
    }

    totalLength() {
        return this.length + this.children.reduce((s, c) => s + c.totalLength(), 0);
    }

    branchCount() {
        return this.children.length + this.children.reduce((s, c) => s + c.branchCount(), 0);
    }

    isFullyGrown() {
        if (this.growing) return false;
        return this.children.every(c => c.isFullyGrown());
    }
}

/* ============================================================
   PLANT CLASS
   ============================================================ */
class Plant {
    constructor(variety, gravity, lightDir) {
        this.variety = variety;
        this.age     = 0;
        const jitter     = (Math.random() - 0.5) * 12;
        const shootStart = gravity > 0 ? -90 + jitter : Math.random() * 360;
        const rootStart  = gravity > 0 ?  90 + jitter : (shootStart + 180) % 360;
        this.shoot = new Segment(0, 0, shootStart, 0, false, variety);
        this.root  = new Segment(0, 0, rootStart,  0, true,  variety);
    }

    update(gravity, lightDir) {
        this.age++;
        if (this.age < 8) return;
        this.shoot.grow(gravity, lightDir);
        this.root.grow(gravity, lightDir);
    }

    bounds() {
        const pts = [];
        collectPts(this.shoot, pts);
        collectPts(this.root,  pts);
        if (!pts.length) return { minX: -20, maxX: 20, minY: -20, maxY: 20 };
        return {
            minX: Math.min(...pts.map(p => p.x)),
            maxX: Math.max(...pts.map(p => p.x)),
            minY: Math.min(...pts.map(p => p.y)),
            maxY: Math.max(...pts.map(p => p.y)),
        };
    }

    isFullyGrown() {
        return this.shoot.isFullyGrown() && this.root.isFullyGrown();
    }
}

/* ============================================================
   ANIMATED STAR FIELD (Space Hero Background)
   ============================================================ */
function initStarField() {
    const canvas = el('spaceCanvas');
    if (!canvas) return;

    const { ctx, W, H } = hiDPI(canvas);
    const stars = [];
    const starCount = Math.floor((W * H) / 3000);

    for (let i = 0; i < starCount; i++) {
        stars.push({
            x:         Math.random() * W,
            y:         Math.random() * H,
            radius:    Math.random() * 1.5,
            opacity:   Math.random() * 0.7 + 0.3,
            speed:     Math.random() * 0.15 + 0.05,
            twinkle:   Math.random() * Math.PI * 2,
            twinkleSpeed: Math.random() * 0.02 + 0.01
        });
    }

    function animateStars() {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'transparent';
        ctx.fillRect(0, 0, W, H);

        stars.forEach(star => {
            star.y += star.speed;
            if (star.y > H + 10) {
                star.y = -10;
                star.x = Math.random() * W;
            }
            star.twinkle += star.twinkleSpeed;

            const twinkleFactor = (Math.sin(star.twinkle) + 1) / 2;
            const alpha = star.opacity * (0.4 + twinkleFactor * 0.6);

            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        requestAnimationFrame(animateStars);
    }

    animateStars();
}

/* ============================================================
   DRAWING HELPERS
   ============================================================ */
function drawSegment(ctx, seg) {
    if (seg.length < 1) return;

    const v    = VARIETIES[seg.variety];
    const rad  = seg.angle * Math.PI / 180;
    const col  = seg.isRoot ? v.rootColor : v.stemColor;
    const endW = Math.max(seg.baseWidth * 0.35, 0.4);

    const steps = Math.max(Math.floor(seg.length / 6), 2);
    for (let i = 0; i < steps; i++) {
        const t0 = i       / steps;
        const t1 = (i + 1) / steps;
        ctx.strokeStyle = col;
        ctx.lineWidth   = seg.baseWidth * (1 - t0) + endW * t0;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(seg.x + Math.cos(rad) * seg.length * t0,
                   seg.y + Math.sin(rad) * seg.length * t0);
        ctx.lineTo(seg.x + Math.cos(rad) * seg.length * t1,
                   seg.y + Math.sin(rad) * seg.length * t1);
        ctx.stroke();
    }

    if (!seg.isRoot) {
        seg.leafAt.forEach((lp, idx) => {
            if (lp > seg.length) return;
            drawLeaf(ctx,
                     seg.x + Math.cos(rad) * lp,
                     seg.y + Math.sin(rad) * lp,
                     seg.angle,
                     idx % 2 === 0 ? 1 : -1,
                     v);
        });
    }

    if (seg.isRoot && seg.generation === 0) {
        ctx.strokeStyle = v.rootColor + '70';
        ctx.lineWidth   = 0.6;
        for (let d = 12; d < seg.length; d += 13) {
            for (const s of [1, -1]) {
                const hx = seg.x + Math.cos(rad) * d;
                const hy = seg.y + Math.sin(rad) * d;
                const ha = rad + s * (Math.PI / 2 + (Math.random() - 0.5) * 0.3);
                ctx.beginPath();
                ctx.moveTo(hx, hy);
                ctx.lineTo(hx + Math.cos(ha) * 6, hy + Math.sin(ha) * 6);
                ctx.stroke();
            }
        }
    }

    for (const c of seg.children) drawSegment(ctx, c);
}

function drawLeaf(ctx, x, y, angleDeg, side, v) {
    const la = (angleDeg + side * 72) * Math.PI / 180;
    const ls = v.leafScale;
    let rx, ry;
    if      (v.leafShape === 'broad')  { rx = ls * 13; ry = ls * 6.5; }
    else if (v.leafShape === 'narrow') { rx = ls * 19; ry = ls * 3.2; }
    else if (v.leafShape === 'lance')  { rx = ls * 11; ry = ls * 4.0; }
    else                               { rx = ls * 10; ry = ls * 5.5; }

    ctx.fillStyle   = v.leafColor;
    ctx.strokeStyle = v.stemColor + '99';
    ctx.lineWidth   = 0.6;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(la) * rx * 0.65,
                y + Math.sin(la) * ry * 0.65,
                rx, ry, la, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

/* ============================================================
   SIMULATION CANVAS RENDER
   ============================================================ */
function renderCanvas() {
    const canvas = el('clinostatCanvas');
    if (!canvas) return;

    const { ctx, W, H } = hiDPI(canvas);
    const isDark = App.theme === 'dark';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = isDark ? '#0f172a' : '#eef2f7';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
    ctx.lineWidth   = 1;
    for (let gx = 0; gx < W; gx += 40) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += 40) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    if (App.lightDir !== 'none') drawLightOverlay(ctx, W, H, App.lightDir);
    if (App.gravity > 0) {
        drawGravityArrow(ctx, W, H, App.gravity, isDark);
    } else {
        ctx.fillStyle    = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)';
        ctx.font         = '12px system-ui, sans-serif';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Microgravity active', 12, H - 10);
    }

    const cx = W / 2;
    const cy = H * 0.57;

    if (App.plant) {
        const b  = App.plant.bounds();
        const bW = b.maxX - b.minX + 80;
        const bH = b.maxY - b.minY + 80;
        App.camera.targetScale = Math.min((W - 80) / bW, (H - 80) / bH, 1.0);
        App.camera.targetPanY  = (b.minY + b.maxY) / 2;
    }
    App.camera.scale += (App.camera.targetScale - App.camera.scale) * 0.035;
    App.camera.panY  += (App.camera.targetPanY  - App.camera.panY)  * 0.035;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(App.camera.scale, App.camera.scale);
    ctx.translate(0, -App.camera.panY);

    if (App.plant) {
        drawSegment(ctx, App.plant.root);
        drawSegment(ctx, App.plant.shoot);
    }

    ctx.fillStyle   = '#c09050';
    ctx.strokeStyle = '#7a5010';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 7, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    ctx.fillStyle    = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.28)';
    ctx.font         = '12px system-ui, sans-serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(VARIETIES[App.variety].label, W - 12, H - 10);
}

function drawLightOverlay(ctx, W, H, dir) {
    const pos = {
        top:    { x: W / 2,  y: 28,     nx: 0,  ny: 1  },
        bottom: { x: W / 2,  y: H - 28, nx: 0,  ny: -1 },
        left:   { x: 28,     y: H / 2,  nx: 1,  ny: 0  },
        right:  { x: W - 28, y: H / 2,  nx: -1, ny: 0  },
    }[dir];
    if (!pos) return;

    const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 58);
    g.addColorStop(0, 'rgba(255,220,50,0.42)');
    g.addColorStop(1, 'rgba(255,220,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 58, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 13, 0, Math.PI * 2); ctx.fill();

    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.strokeStyle = '#FFA500'; ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(pos.x + Math.cos(a) * 17, pos.y + Math.sin(a) * 17);
        ctx.lineTo(pos.x + Math.cos(a) * 25, pos.y + Math.sin(a) * 25);
        ctx.stroke();
    }

    const ba = Math.atan2(pos.ny, pos.nx);
    ctx.strokeStyle = 'rgba(255,220,50,0.14)'; ctx.lineWidth = 1;
    for (const off of [-0.22, 0, 0.22]) {
        const a = ba + off;
        ctx.beginPath();
        ctx.moveTo(pos.x + Math.cos(a) * 28, pos.y + Math.sin(a) * 28);
        ctx.lineTo(pos.x + Math.cos(a) * 130, pos.y + Math.sin(a) * 130);
        ctx.stroke();
    }

    ctx.fillStyle    = 'rgba(0,0,0,0.28)';
    ctx.font         = '11px system-ui, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Light source', pos.x + pos.nx * 42, pos.y + pos.ny * 42);
}

function drawGravityArrow(ctx, W, H, g, isDark) {
    const ax  = W - 38, ay = 44;
    const len = 38 * g;
    const col = isDark ? 'rgba(255,110,110,0.75)' : 'rgba(190,45,45,0.70)';
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay + len); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax, ay + len);
    ctx.lineTo(ax - 5, ay + len - 9);
    ctx.lineTo(ax + 5, ay + len - 9);
    ctx.closePath(); ctx.fill();
    ctx.font         = '11px system-ui, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('g = ' + g, ax, ay + len + 5);
}

/* ============================================================
   SIMPLE DIAGRAMS (unchanged from before)
   ============================================================ */
function drawAllDiagrams() {
    diagramGravitropism();
    diagramStatocyte();
    diagramPhototropism();
}

function diagramGravitropism() {
    const canvas = el('gravitropismDiagram');
    if (!canvas) return;
    const { ctx, W, H } = hiDPI(canvas);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#b08040'; ctx.fillRect(0, H - 52, W, 52);
    ctx.fillStyle = '#8B5e2c'; ctx.fillRect(0, H - 56, W, 7);

    const sx = W / 2, sy = H - 56;

    ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy);
    for (let i = 1; i <= 70; i++) ctx.lineTo(sx + Math.sin(i * 0.12) * 5, sy + i);
    ctx.stroke();

    ctx.strokeStyle = '#3a7a2a'; ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    for (let i = 1; i <= 105; i++) ctx.lineTo(sx + Math.sin(i * 0.09) * 3, sy - i);
    ctx.stroke();

    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Gravitropic response', W / 2, 8);
}

function diagramStatocyte() {
    const canvas = el('statocyteDiagram');
    if (!canvas) return;
    const { ctx, W, H } = hiDPI(canvas);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, W, H);

    const drawCell = (cx, cy, rot) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.strokeStyle = '#4A90E2'; ctx.lineWidth = 2.5;
        ctx.strokeRect(-44, -72, 88, 144);
        ctx.restore();
    };

    drawCell(W * 0.3, H / 2, 0);
    drawCell(W * 0.7, H / 2, Math.PI / 5);

    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Statocytes sense gravity', W / 2, 8);
}

function diagramPhototropism() {
    const canvas = el('phototropismDiagram');
    if (!canvas) return;
    const { ctx, W, H } = hiDPI(canvas);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#b08040'; ctx.fillRect(0, H - 38, W, 38);

    const px = W / 2 + 35, py = H - 38;
    ctx.strokeStyle = '#3a7a2a'; ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px - 28, py - 50, px - 68, py - 94);
    ctx.stroke();

    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Phototropic response', W / 2, 8);
}

/* ============================================================
   ENHANCED GROWTH CHART with toggles and comparison mode
   ============================================================ */
function drawChart() {
    const canvas = el('growthChart');
    if (!canvas) return;

    const { ctx, W, H } = hiDPI(canvas);
    const m      = { top: 48, right: 48, bottom: 62, left: 68 };
    const cW     = W - m.left - m.right;
    const cH     = H - m.top  - m.bottom;
    const isDark = App.theme === 'dark';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle    = isDark ? '#e2e8f0' : '#1e293b';
    ctx.font         = 'bold 15px system-ui';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Plant Growth Over Time', W / 2, 14);

    const hasData = App.dataPoints.length >= 2;
    const hasCompare = App.compareMode && App.compareData.length >= 2;

    if (!hasData && !hasCompare) {
        ctx.font         = '13px system-ui';
        ctx.fillStyle    = isDark ? '#94a3b8' : '#64748b';
        ctx.textBaseline = 'middle';
        ctx.fillText('Run an experiment to collect data.', W / 2, H / 2);
        return;
    }

    const allData = hasCompare ? [...App.dataPoints, ...App.compareData] : App.dataPoints;
    const maxT = Math.max(...allData.map(p => p.time));
    const maxL = Math.max(...allData.map(p => Math.max(p.stemLen || 0, p.rootDep || 0, p.stemAngle || 0)));
    const sx   = t => m.left + (t / maxT) * cW;
    const sy   = l => H - m.bottom - (l / maxL) * cH;

    // Grid
    for (let i = 0; i <= 5; i++) {
        const y = m.top + (i / 5) * cH;
        ctx.strokeStyle  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        ctx.lineWidth    = 1;
        ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(W - m.right, y); ctx.stroke();
        ctx.fillStyle    = isDark ? '#94a3b8' : '#64748b';
        ctx.font         = '11px system-ui';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(((1 - i / 5) * maxL).toFixed(0), m.left - 8, y);
    }

    // Axes
    ctx.strokeStyle = isDark ? '#475569' : '#cbd5e1'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(m.left, m.top);        ctx.lineTo(m.left, H - m.bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m.left, H - m.bottom); ctx.lineTo(W - m.right, H - m.bottom); ctx.stroke();

    ctx.fillStyle    = isDark ? '#94a3b8' : '#64748b';
    ctx.font         = '12px system-ui';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Time (minutes)', W / 2, H - 2);

    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    // Draw main experiment lines
    if (hasData) {
        if (App.chartToggles.stemLength) {
            ctx.strokeStyle = '#228B22'; ctx.lineWidth = 2.5;
            ctx.beginPath();
            App.dataPoints.forEach((p, i) => {
                i === 0 ? ctx.moveTo(sx(p.time), sy(p.stemLen))
                        : ctx.lineTo(sx(p.time), sy(p.stemLen));
            });
            ctx.stroke();
        }

        if (App.chartToggles.rootDepth) {
            ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 2.5;
            ctx.beginPath();
            App.dataPoints.forEach((p, i) => {
                i === 0 ? ctx.moveTo(sx(p.time), sy(p.rootDep))
                        : ctx.lineTo(sx(p.time), sy(p.rootDep));
            });
            ctx.stroke();
        }

        if (App.chartToggles.stemAngle) {
            ctx.strokeStyle = '#9333ea'; ctx.lineWidth = 2;
            ctx.beginPath();
            App.dataPoints.forEach((p, i) => {
                i === 0 ? ctx.moveTo(sx(p.time), sy(p.stemAngle))
                        : ctx.lineTo(sx(p.time), sy(p.stemAngle));
            });
            ctx.stroke();
        }
    }

    // Draw comparison lines (dashed)
    if (hasCompare) {
        ctx.setLineDash([5, 3]);

        if (App.chartToggles.stemLength) {
            ctx.strokeStyle = '#228B2266'; ctx.lineWidth = 2;
            ctx.beginPath();
            App.compareData.forEach((p, i) => {
                i === 0 ? ctx.moveTo(sx(p.time), sy(p.stemLen))
                        : ctx.lineTo(sx(p.time), sy(p.stemLen));
            });
            ctx.stroke();
        }

        if (App.chartToggles.rootDepth) {
            ctx.strokeStyle = '#8B451366'; ctx.lineWidth = 2;
            ctx.beginPath();
            App.compareData.forEach((p, i) => {
                i === 0 ? ctx.moveTo(sx(p.time), sy(p.rootDep))
                        : ctx.lineTo(sx(p.time), sy(p.rootDep));
            });
            ctx.stroke();
        }

        ctx.setLineDash([]);
    }

    // Legend
    const lx = W - m.right - 140, ly = m.top + 14;
    let lyOffset = 0;

    if (App.chartToggles.stemLength) {
        ctx.fillStyle = '#228B22'; ctx.fillRect(lx, ly + lyOffset, 18, 3);
        ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
        ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('Stem length', lx + 24, ly + lyOffset + 1);
        lyOffset += 16;
    }

    if (App.chartToggles.rootDepth) {
        ctx.fillStyle = '#8B4513'; ctx.fillRect(lx, ly + lyOffset, 18, 3);
        ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
        ctx.fillText('Root depth', lx + 24, ly + lyOffset + 1);
        lyOffset += 16;
    }

    if (App.chartToggles.stemAngle) {
        ctx.fillStyle = '#9333ea'; ctx.fillRect(lx, ly + lyOffset, 18, 3);
        ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
        ctx.fillText('Stem angle', lx + 24, ly + lyOffset + 1);
        lyOffset += 16;
    }

    if (hasCompare) {
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.font = '10px system-ui';
        ctx.fillText('(dashed = Earth)', lx, ly + lyOffset + 8);
    }
}

/* ============================================================
   EXPERIMENT LIFECYCLE with auto-stop at maturity
   ============================================================ */
function startExperiment() {
    if (App.isRunning) return;

    App.variety   = el('plantVariety').value;
    App.gravity   = parseFloat(el('gravitySelect').value);
    App.compareMode = el('compareMode')?.checked || false;
    App.camera    = { scale: 1, targetScale: 1, panY: 0, targetPanY: 0 };
    App.plant     = new Plant(App.variety, App.gravity, App.lightDir);
    App.isRunning = true;
    App.isComplete = false;
    App.startTime = Date.now() - App.elapsedMs;

    // Lock hypothesis
    el('predictionText').disabled = true;

    // If compare mode, create Earth plant
    if (App.compareMode && App.gravity !== 1) {
        App.comparePlant = new Plant(App.variety, 1, App.lightDir);
    } else {
        App.comparePlant = null;
        App.compareData  = [];
    }

    el('startExperiment').disabled = true;
    el('stopExperiment').disabled  = false;
    el('plantVariety').disabled    = true;
    el('gravitySelect').disabled   = true;
    el('compareMode').disabled     = true;

    const gLabel = el('gravitySelect').options[el('gravitySelect').selectedIndex].text;
    logObs('Experiment started — ' + VARIETIES[App.variety].label + ', ' + gLabel);
    animate();
}

function stopExperiment() {
    App.isRunning = false;
    el('startExperiment').disabled = false;
    el('stopExperiment').disabled  = true;
    logObs('Paused at ' + fmtTime(App.elapsedMs));
    recordPoint();
}

function resetExperiment() {
    App.isRunning  = false;
    App.isComplete = false;
    cancelAnimationFrame(App.animId);
    App.elapsedMs = 0;
    App.plant     = null;
    App.comparePlant = null;
    App.camera    = { scale: 1, targetScale: 1, panY: 0, targetPanY: 0 };

    // Unlock hypothesis
    el('predictionText').disabled = false;

    el('startExperiment').disabled = false;
    el('stopExperiment').disabled  = true;
    el('plantVariety').disabled    = false;
    el('gravitySelect').disabled   = false;
    el('compareMode').disabled     = false;
    el('elapsedTime').textContent  = '0:00';

    setVal('stemAngleVal',  '—');
    setVal('stemLengthVal', '0 mm');
    setVal('rootDepthVal',  '0 mm');
    setVal('branchCountVal', '0');
    setVal('growthPhaseVal', 'Germination');
    setVal('tropismVal',    '—');

    el('statusMessage').textContent = '';
    el('statusMessage').className = 'status-message';

    logObs('Experiment reset.');
    renderCanvas();
}

function animate() {
    if (!App.isRunning) return;

    App.elapsedMs = Date.now() - App.startTime;
    el('elapsedTime').textContent = fmtTime(App.elapsedMs);

    if (App.plant) {
        App.plant.update(App.gravity, App.lightDir);
        updateLiveData();

        // Check if fully grown — auto-stop
        if (!App.isComplete && App.plant.isFullyGrown()) {
            App.isComplete = true;
            App.isRunning  = false;
            el('startExperiment').disabled = true;
            el('stopExperiment').disabled  = true;
            const msg = el('statusMessage');
            msg.textContent = 'Growth Complete';
            msg.className = 'status-message complete';
            logObs('Plant reached maturity. Growth complete.');
            recordPoint();
        }

        if (Math.floor(App.elapsedMs / 8000) > App.dataPoints.length && App.isRunning) {
            recordPoint();
        }
    }

    if (App.comparePlant) {
        App.comparePlant.update(1, App.lightDir);
        if (Math.floor(App.elapsedMs / 8000) > App.compareData.length && App.isRunning) {
            recordComparePoint();
        }
    }

    renderCanvas();
    if (App.isRunning) {
        App.animId = requestAnimationFrame(animate);
    }
}

function updateLiveData() {
    if (!App.plant) return;
    const deg      = ((App.plant.shoot.angle % 360) + 360) % 360;
    const stemLen  = App.plant.shoot.totalLength().toFixed(1);
    const rootDep  = App.plant.root.totalLength().toFixed(1);
    const branches = App.plant.shoot.branchCount() + App.plant.root.branchCount();
    const ratio    = App.plant.shoot.length / App.plant.shoot.K;
    const phase    = ratio < 0.05 ? 'Germination'
                   : ratio < 0.30 ? 'Early growth'
                   : ratio < 0.70 ? 'Rapid growth'
                   : ratio < 0.95 ? 'Maturation'
                   :                'Mature';
    const tropism  = App.gravity === 0
        ? (App.lightDir !== 'none' ? 'Phototropism'   : 'Undirected')
        : (App.lightDir !== 'none' ? 'Grav. + Photo.' : 'Gravitropism');

    setVal('stemAngleVal',   Math.round(deg) + '\u00b0');
    setVal('stemLengthVal',  stemLen + ' mm');
    setVal('rootDepthVal',   rootDep + ' mm');
    setVal('branchCountVal', branches);
    setVal('growthPhaseVal', phase);
    setVal('tropismVal',     tropism);
}

/* ============================================================
   DATA RECORDING
   ============================================================ */
function recordPoint() {
    if (!App.plant) return;
    App.dataPoints.push({
        time:      App.elapsedMs / 60000,
        variety:   App.variety,
        gravity:   App.gravity,
        light:     App.lightDir,
        stemAngle: Math.round(((App.plant.shoot.angle % 360) + 360) % 360),
        stemLen:   parseFloat(App.plant.shoot.totalLength().toFixed(1)),
        rootDep:   parseFloat(App.plant.root.totalLength().toFixed(1)),
        branches:  App.plant.shoot.branchCount()
    });
    updateTable();
    drawChart();
}

function recordComparePoint() {
    if (!App.comparePlant) return;
    App.compareData.push({
        time:      App.elapsedMs / 60000,
        stemLen:   parseFloat(App.comparePlant.shoot.totalLength().toFixed(1)),
        rootDep:   parseFloat(App.comparePlant.root.totalLength().toFixed(1)),
        stemAngle: Math.round(((App.comparePlant.shoot.angle % 360) + 360) % 360)
    });
    drawChart();
}

function updateTable() {
    const tbody = el('dataTableBody');
    tbody.innerHTML = '';
    if (!App.dataPoints.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-table">No data recorded yet.</td></tr>';
        return;
    }
    for (const p of App.dataPoints) {
        const tr = tbody.insertRow();
        [p.time.toFixed(2),
         VARIETIES[p.variety]?.label || p.variety,
         p.gravity + 'g',
         p.stemAngle + '\u00b0',
         p.stemLen,
         p.rootDep,
         p.branches
        ].forEach(v => { tr.insertCell().textContent = v; });
    }
}

function exportData() {
    if (!App.dataPoints.length) { alert('No data to export yet.'); return; }
    let csv = 'Time (min),Variety,Gravity,Light,Stem Angle,Stem Length (mm),Root Depth (mm),Branches\n';
    for (const p of App.dataPoints) {
        csv += [p.time.toFixed(2), VARIETIES[p.variety]?.label || p.variety,
                p.gravity, p.light, p.stemAngle, p.stemLen, p.rootDep, p.branches
               ].join(',') + '\n';
    }
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'plant_growth_data.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}

function clearData() {
    if (confirm('Clear all recorded data?')) {
        App.dataPoints = [];
        App.compareData = [];
        updateTable();
        drawChart();
    }
}

/* ============================================================
   OBSERVATION LOG
   ============================================================ */
function logObs(msg) {
    const log = el('observationsLog');
    const ph  = log.querySelector('.initial');
    if (ph) ph.remove();
    const p = document.createElement('p');
    p.className   = 'observation-entry';
    p.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
}

/* ============================================================
   ACCORDION
   ============================================================ */
function initAccordion() {
    document.querySelectorAll('.accordion-header').forEach(h => {
        h.addEventListener('click', () => {
            const item = h.parentElement;
            const was  = item.classList.contains('active');
            document.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('active'));
            if (!was) item.classList.add('active');
        });
    });
}

/* ============================================================
   THEME
   ============================================================ */
function initTheme() {
    setTheme(localStorage.getItem('theme') || 'light');
    el('themeToggle')?.addEventListener('click', () =>
        setTheme(App.theme === 'light' ? 'dark' : 'light')
    );
}

function setTheme(t) {
    App.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    const icon = document.querySelector('.theme-icon');
    if (icon) icon.textContent = t === 'light' ? 'Dark Mode' : 'Light Mode';
    drawChart();
    renderCanvas();
    drawAllDiagrams();
}

/* ============================================================
   UTILITIES
   ============================================================ */
function el(id)          { return document.getElementById(id); }
function setVal(id, v)   { const e = el(id); if (e) e.textContent = v; }
function fmtTime(ms)     { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function dirToDeg(dir)   { return { top: -90, bottom: 90, left: 180, right: 0 }[dir] ?? 0; }
function angleDiff(a, b) { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
function collectPts(seg, out) { out.push({ x: seg.x, y: seg.y }, seg.tip()); seg.children.forEach(c => collectPts(c, out)); }

/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initAccordion();
    initStarField();
    drawAllDiagrams();
    renderCanvas();
    drawChart();

    el('startExperiment')?.addEventListener('click', startExperiment);
    el('stopExperiment')?.addEventListener('click',  stopExperiment);
    el('resetExperiment')?.addEventListener('click', resetExperiment);
    el('exportCSV')?.addEventListener('click',  exportData);
    el('clearData')?.addEventListener('click',  clearData);

    el('gravitySelect')?.addEventListener('change', e => {
        App.gravity = parseFloat(e.target.value);
    });

    document.querySelectorAll('.light-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.light-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            App.lightDir = this.dataset.direction;
            if (App.isRunning) logObs('Light source changed to: ' + App.lightDir);
            renderCanvas();
        });
    });

    // Chart toggles
    el('showStemLength')?.addEventListener('change', e => {
        App.chartToggles.stemLength = e.target.checked;
        drawChart();
    });
    el('showRootDepth')?.addEventListener('change', e => {
        App.chartToggles.rootDepth = e.target.checked;
        drawChart();
    });
    el('showStemAngle')?.addEventListener('change', e => {
        App.chartToggles.stemAngle = e.target.checked;
        drawChart();
    });

    // Smooth nav scroll
    document.querySelectorAll('.nav-links a').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
        });
    });

    // Redraw on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            renderCanvas();
            drawChart();
            drawAllDiagrams();
        }, 120);
    });
});