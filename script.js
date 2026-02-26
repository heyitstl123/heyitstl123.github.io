/* ============================================================
   GROWING PLANTS IN SIMULATED MICROGRAVITY
   
   SEGMENT CHAIN MODEL — Curvature through incremental growth
   Each new segment added at tip gets a small angle offset
   Previous segments remain fixed — curvature accumulates
   
   VISUAL ENHANCEMENTS (New):
   ===========================
   1. LEAVES:
      - Added at regular intervals (8-12 pixels) along stem
      - Alternate sides for natural appearance
      - Size varies (0.7-1.3x base) and scales with depth
      - Natural droop angle (15-25°) for realism
   
   2. BRANCHES:
      - Occasional branching (15% chance per frame when mature)
      - Emerge at 25-45° angles from parent stem
      - Grow at 70% speed of main stem
      - Limited depth (max 5 levels) to prevent overpopulation
   
   3. VISUAL DETAILS:
      - Gradual stem tapering (base → tip)
      - Branches are thinner (70% width) than main stem
      - Leaf central vein for detail
      - Random variation in leaf angles and sizes
      - Root hairs remain on primary roots only
   
   PERFORMANCE:
   - Efficient recursive rendering
   - Minimal overhead from leaf/branch tracking
   - No heavy operations; maintains smooth animation
   ============================================================ */

'use strict';

const VARIETIES = {
    cress: {
        label: 'Cress',
        stemWidth: 2.2, stemColor: '#4a7c3f',
        maxStemLen: 240, growthRate: 0.055,
        branchChance: 0.28, branchSpread: 0.60,
        leafShape: 'oval', leafScale: 0.90, leafColor: '#5aad4e', leafSpacing: 20,
        rootColor: '#8B6914', rootWidth: 1.6,
        rootGrowthRate: 0.040, maxRootLen: 120,
    },
    bean: {
        label: 'Bean',
        stemWidth: 5.8, stemColor: '#3a6e2f',
        maxStemLen: 300, growthRate: 0.030,
        branchChance: 0.10, branchSpread: 0.72,
        leafShape: 'broad', leafScale: 2.10, leafColor: '#4d9440', leafSpacing: 36,
        rootColor: '#7a5510', rootWidth: 3.8,
        rootGrowthRate: 0.025, maxRootLen: 160,
    },
    arabidopsis: {
        label: 'Arabidopsis',
        stemWidth: 1.7, stemColor: '#5c8a50',
        maxStemLen: 190, growthRate: 0.048,
        branchChance: 0.38, branchSpread: 0.95,
        leafShape: 'lance', leafScale: 0.68, leafColor: '#68b85c', leafSpacing: 15,
        rootColor: '#9e7e20', rootWidth: 1.1,
        rootGrowthRate: 0.050, maxRootLen: 145,
    },
    wheat: {
        label: 'Wheat',
        stemWidth: 2.1, stemColor: '#7a9040',
        maxStemLen: 280, growthRate: 0.042,
        branchChance: 0.05, branchSpread: 0.18,
        leafShape: 'narrow', leafScale: 1.15, leafColor: '#8db855', leafSpacing: 28,
        rootColor: '#a08830', rootWidth: 1.5,
        rootGrowthRate: 0.032, maxRootLen: 110,
    }
};

const App = {
    theme: 'light',
    isRunning: false,
    isComplete: false,
    startTime: null,
    elapsedMs: 0,
    animId: null,
    gravity: 0,
    lightDir: 'none',
    variety: 'cress',
    compareMode: false,
    plant: null,
    comparePlant: null,
    dataPoints: [],
    compareData: [],
    camera: { scale: 1, targetScale: 1, panY: 0, targetPanY: 0 },
    zoom: { level: 1, targetLevel: 1 },
    chartToggles: { stemLength: true, rootDepth: true }
};

function hiDPI(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || parseInt(canvas.getAttribute('width'), 10) || 800;
    const cssH = canvas.clientHeight || parseInt(canvas.getAttribute('height'), 10) || 400;
    const physW = Math.round(cssW * dpr);
    const physH = Math.round(cssH * dpr);
    if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width = physW; canvas.height = physH;
        canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W: cssW, H: cssH };
}

/* ============================================================
   SEGMENT — Angle offset calculated ONCE at creation
   Segments grow in length only. Angle never changes.
   Chain of segments creates smooth cumulative curvature.
   
   VISUAL ENHANCEMENTS:
   - Leaves added at regular intervals (alternating sides)
   - Occasional branching at mature segments
   - Gradual stem tapering based on position in chain
   ============================================================ */
class Segment {
    constructor(parent, isRoot, variety, angleOffset = 0, isBranch = false) {
        this.parent = parent;
        this.isRoot = isRoot;
        this.variety = variety;
        this.angleOffset = angleOffset;  // FIXED after creation
        this.isBranch = isBranch;  // Branches grow slower
        
        const v = VARIETIES[variety];
        
        // Short segments create smoother curves
        this.targetLength = isRoot ? 10 : 12;
        this.length = 0.1;
        this.growing = true;
        this.children = [];
        
        // Leaf system: track leaves with side info for alternating pattern
        this.leaves = [];  // Array of {position, side, size}
        this.nextLeafSide = Math.random() < 0.5 ? 1 : -1;  // Start random
        
        // Branching control
        this.hasBranched = false;
        
        const depth = this.getDepth();
        const gf = Math.pow(0.62, depth);
        
        // Gradual width tapering based on depth in chain
        const baseFactor = isRoot ? v.rootWidth : v.stemWidth;
        this.baseWidth = Math.max(baseFactor * gf, 0.5);
        
        // Additional width reduction for branches
        if (isBranch) {
            this.baseWidth *= 0.7;
        }
    }

    get angle() {
        if (!this.parent) {
            return this.isRoot ? Math.PI / 2 : -Math.PI / 2;
        }
        return this.parent.angle + this.angleOffset;
    }

    get x() {
        return this.parent ? this.parent.endX : 0;
    }

    get y() {
        return this.parent ? this.parent.endY : 0;
    }

    get endX() {
        return this.x + this.length * Math.cos(this.angle);
    }

    get endY() {
        return this.y + this.length * Math.sin(this.angle);
    }

    getDepth() {
        let depth = 0;
        let p = this.parent;
        while (p) { depth++; p = p.parent; }
        return depth;
    }

    /* ----------------------------------------------------------
       Grow in length. When target reached, create new tip segment.
       Add leaves at intervals and occasionally create branches.
    ---------------------------------------------------------- */
    grow(gravity, lightDir, totalLength, maxLength) {
        if (this.growing) {
            const v = VARIETIES[this.variety];
            const r = this.isRoot ? v.rootGrowthRate : v.growthRate;
            
            // Branches grow at 70% speed of main stem
            const growthMultiplier = this.isBranch ? 0.7 : 1.0;
            
            // Grow length
            this.length += r * 2.5 * growthMultiplier;
            
            // Add leaves at intervals (shoots only, not roots or branches)
            if (!this.isRoot && !this.isBranch && this.length > 3) {
                const leafInterval = 8 + Math.random() * 4;  // 8-12 pixel spacing
                const lastLeafPos = this.leaves.length > 0 
                    ? this.leaves[this.leaves.length - 1].position 
                    : 0;
                
                if (this.length - lastLeafPos > leafInterval) {
                    // Add alternating leaf
                    const side = this.nextLeafSide;
                    const size = 0.7 + Math.random() * 0.6;  // Variation 0.7-1.3
                    this.leaves.push({
                        position: this.length,
                        side: side,
                        size: size
                    });
                    this.nextLeafSide *= -1;  // Alternate for next leaf
                }
            }
            
            // Occasional branching (shoots only, when mature enough)
            if (!this.isRoot && !this.isBranch && !this.hasBranched && 
                this.length > this.targetLength * 0.6 && 
                this.getDepth() < 5 &&  // Don't branch too deep
                Math.random() < 0.15) {  // 15% chance per frame
                
                this._createBranch(gravity, lightDir);
                this.hasBranched = true;
            }
            
            // When full, create new segment at tip
            if (this.length >= this.targetLength && this.children.length === 0) {
                if (totalLength < maxLength) {
                    this.growing = false;
                    this._addTipSegment(gravity, lightDir);
                } else {
                    this.growing = false;
                }
            }
        }
        
        for (const c of this.children) {
            c.grow(gravity, lightDir, totalLength, maxLength);
        }
    }

    /* ----------------------------------------------------------
       Create new tip segment with calculated angle offset.
       This is where curvature happens — ONCE, at creation.
    ---------------------------------------------------------- */
    _addTipSegment(gravity, lightDir) {
        const currentAngle = this.angle;
        let offset = 0;
        
        // GRAVITROPISM — very strong for roots
        if (gravity > 0) {
            const target = this.isRoot ? Math.PI / 2 : -Math.PI / 2;
            const diff = angleDiff(target, currentAngle);
            offset += diff * (this.isRoot ? 0.06 : 0.028);
        }
        
        // PHOTOTROPISM — toward light
        if (lightDir !== 'none') {
            const lightAngle = dirToRad(lightDir);
            const target = this.isRoot ? lightAngle + Math.PI : lightAngle;
            const diff = angleDiff(target, currentAngle);
            offset += diff * (this.isRoot 
                ? (gravity === 0 ? 0.020 : 0.010)
                : (gravity === 0 ? 0.042 : 0.025));
        }
        
        // RANDOM VARIATION — key for zero-g curves
        offset += (Math.random() - 0.5) * (gravity === 0
            ? (this.isRoot ? 0.022 : 0.038)
            : (this.isRoot ? 0.008 : 0.018));
        
        this.children.push(new Segment(this, this.isRoot, this.variety, offset, this.isBranch));
    }

    /* ----------------------------------------------------------
       Create a branch segment at current position.
       Branch grows at reduced rate and different angle.
    ---------------------------------------------------------- */
    _createBranch(gravity, lightDir) {
        const v = VARIETIES[this.variety];
        
        // Branch angle: 25-45 degrees from parent
        const branchSide = Math.random() < 0.5 ? 1 : -1;
        const branchAngle = branchSide * (0.4 + Math.random() * 0.35);  // 0.4-0.75 radians (23-43°)
        
        // Create branch segment (marked as branch for slower growth)
        const branch = new Segment(this, false, this.variety, branchAngle, true);
        this.children.push(branch);
    }

    totalLength() {
        return this.length + this.children.reduce((s, c) => s + c.totalLength(), 0);
    }

    isFullyGrown() {
        if (this.growing) return false;
        return this.children.every(c => c.isFullyGrown());
    }
}

class Plant {
    constructor(variety, gravity, lightDir) {
        this.variety = variety;
        this.age = 0;
        
        const v = VARIETIES[variety];
        this.maxShootLength = v.maxStemLen;
        this.maxRootLength = v.maxRootLen;
        
        const jitter = (Math.random() - 0.5) * 0.08;
        this.shoot = new Segment(null, false, variety, jitter);
        this.root = new Segment(null, true, variety, jitter);
    }

    update(gravity, lightDir) {
        this.age++;
        if (this.age < 8) return;
        
        const shootLen = this.shoot.totalLength();
        const rootLen = this.root.totalLength();
        
        this.shoot.grow(gravity, lightDir, shootLen, this.maxShootLength);
        this.root.grow(gravity, lightDir, rootLen, this.maxRootLength);
    }

    bounds() {
        const pts = [];
        collectPts(this.shoot, pts);
        collectPts(this.root, pts);
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
   STAR FIELD
   ============================================================ */
function initStarField() {
    const canvas = el('spaceCanvas');
    if (!canvas) return;
    const { ctx, W, H } = hiDPI(canvas);
    const stars = [];
    const starCount = Math.floor((W * H) / 3000);

    for (let i = 0; i < starCount; i++) {
        stars.push({
            x: Math.random() * W, y: Math.random() * H,
            radius: Math.random() * 1.5,
            opacity: Math.random() * 0.7 + 0.3,
            speed: Math.random() * 0.15 + 0.05,
            twinkle: Math.random() * Math.PI * 2,
            twinkleSpeed: Math.random() * 0.02 + 0.01
        });
    }

    const shooters = [];
    let nextShooter = Date.now() + randBetween(12000, 24000);

    function spawnShooter() {
        shooters.push({
            x: Math.random() * 0.7 + 0.05, y: Math.random() * 0.35,
            vx: Math.cos((35 + Math.random() * 20) * Math.PI / 180) * 0.0016,
            vy: Math.sin((35 + Math.random() * 20) * Math.PI / 180) * 0.0016,
            life: 0, maxLife: randBetween(900, 1500), tail: []
        });
    }

    let lastT = 0;
    function animateStars(now) {
        const dt = now - lastT; lastT = now;
        ctx.clearRect(0, 0, W, H);

        stars.forEach(s => {
            s.y += s.speed;
            if (s.y > H + 10) { s.y = -10; s.x = Math.random() * W; }
            s.twinkle += s.twinkleSpeed;
            const alpha = s.opacity * (0.4 + (Math.sin(s.twinkle) + 1) * 0.3);
            ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
            ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2); ctx.fill();
        });

        if (now >= nextShooter) {
            spawnShooter();
            nextShooter = now + randBetween(12000, 24000);
        }

        for (let i = shooters.length - 1; i >= 0; i--) {
            const sh = shooters[i];
            sh.life += dt;
            const prog = sh.life / sh.maxLife;
            const alpha = prog < 0.15 ? prog / 0.15 : 1 - (prog - 0.15) / 0.85;

            sh.x += sh.vx * dt; sh.y += sh.vy * dt;
            sh.tail.push({ x: sh.x, y: sh.y });
            if (sh.tail.length > 30) sh.tail.shift();

            if (sh.life >= sh.maxLife || sh.x > 1.1 || sh.y > 1.1) {
                shooters.splice(i, 1); continue;
            }

            if (sh.tail.length > 1) {
                const grad = ctx.createLinearGradient(
                    sh.tail[0].x * W, sh.tail[0].y * H, sh.x * W, sh.y * H
                );
                grad.addColorStop(0, 'rgba(255,255,255,0)');
                grad.addColorStop(1, `rgba(200,220,255,${(alpha * 0.8).toFixed(3)})`);
                ctx.strokeStyle = grad; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
                ctx.beginPath();
                sh.tail.forEach((pt, idx) => {
                    idx === 0 ? ctx.moveTo(pt.x * W, pt.y * H) : ctx.lineTo(pt.x * W, pt.y * H);
                });
                ctx.stroke();
            }

            const headGrad = ctx.createRadialGradient(sh.x * W, sh.y * H, 0, sh.x * W, sh.y * H, 5);
            headGrad.addColorStop(0, `rgba(220,235,255,${(alpha * 0.9).toFixed(3)})`);
            headGrad.addColorStop(1, 'rgba(180,210,255,0)');
            ctx.fillStyle = headGrad;
            ctx.beginPath(); ctx.arc(sh.x * W, sh.y * H, 5, 0, Math.PI * 2); ctx.fill();
        }

        requestAnimationFrame(animateStars);
    }
    requestAnimationFrame(t => { lastT = t; animateStars(t); });
}

function randBetween(a, b) { return a + Math.random() * (b - a); }

function initZoom() {
    const canvas = el('clinostatCanvas');
    if (!canvas) return;

    canvas.addEventListener('wheel', e => {
        if (e.ctrlKey) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        App.zoom.targetLevel = Math.max(0.5, Math.min(3.0, App.zoom.targetLevel + delta));
        setVal('zoomVal', Math.round(App.zoom.targetLevel * 100) + '%');
    }, { passive: false });

    let touches = [];
    canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        if (e.touches.length === 2 && touches.length === 2) {
            e.preventDefault();
            const newTouches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
            const oldDist = Math.hypot(touches[1].x - touches[0].x, touches[1].y - touches[0].y);
            const newDist = Math.hypot(newTouches[1].x - newTouches[0].x, newTouches[1].y - newTouches[0].y);
            const scale = newDist / oldDist;
            App.zoom.targetLevel = Math.max(0.5, Math.min(3.0, App.zoom.targetLevel * scale));
            setVal('zoomVal', Math.round(App.zoom.targetLevel * 100) + '%');
            touches = newTouches;
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => { touches = []; });
}

function renderCanvas() {
    const canvas = el('clinostatCanvas');
    if (!canvas) return;
    const { ctx, W, H } = hiDPI(canvas);
    const isDark = App.theme === 'dark';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = isDark ? '#0f172a' : '#eef2f7';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    if (App.lightDir !== 'none') drawLightOverlay(ctx, W, H, App.lightDir);
    if (App.gravity > 0) {
        drawGravityArrow(ctx, W, H, App.gravity, isDark);
    } else {
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)';
        ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('Microgravity active', 12, H - 10);
    }

    const cx = W / 2, cy = H * 0.57;

    if (App.plant) {
        const b = App.plant.bounds();
        const bW = b.maxX - b.minX + 80, bH = b.maxY - b.minY + 80;
        App.camera.targetScale = Math.min((W - 80) / bW, (H - 80) / bH, 1.0);
        App.camera.targetPanY = (b.minY + b.maxY) / 2;
    }
    App.camera.scale += (App.camera.targetScale - App.camera.scale) * 0.035;
    App.camera.panY += (App.camera.targetPanY - App.camera.panY) * 0.035;
    App.zoom.level += (App.zoom.targetLevel - App.zoom.level) * 0.08;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(App.camera.scale * App.zoom.level, App.camera.scale * App.zoom.level);
    ctx.translate(0, -App.camera.panY);

    if (App.plant) {
        drawSegment(ctx, App.plant.root);
        drawSegment(ctx, App.plant.shoot);
    }

    ctx.fillStyle = '#c09050'; ctx.strokeStyle = '#7a5010'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 7, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.restore();

    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.28)';
    ctx.font = '12px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(VARIETIES[App.variety].label, W - 12, H - 10);
}

function drawSegment(ctx, seg) {
    if (seg.length < 1) return;
    const v = VARIETIES[seg.variety];
    const col = seg.isRoot ? v.rootColor : v.stemColor;
    
    // Gradual tapering: thicker at base, thinner at tip
    const endW = Math.max(seg.baseWidth * 0.4, 0.5);

    // Draw smooth tapered segment with subtle curvature
    const steps = Math.max(Math.floor(seg.length / 3), 2);
    for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const x0 = seg.x + (seg.endX - seg.x) * t0;
        const y0 = seg.y + (seg.endY - seg.y) * t0;
        const x1 = seg.x + (seg.endX - seg.x) * t1;
        const y1 = seg.y + (seg.endY - seg.y) * t1;
        
        // Width tapers smoothly from base to tip
        const w = seg.baseWidth * (1 - t0) + endW * t0;
        
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
    }

    // Render leaves along the stem (shoots only)
    if (!seg.isRoot && seg.leaves.length > 0) {
        seg.leaves.forEach((leaf, idx) => {
            if (leaf.position > seg.length) return;
            
            const t = leaf.position / seg.length;
            const lx = seg.x + (seg.endX - seg.x) * t;
            const ly = seg.y + (seg.endY - seg.y) * t;
            
            // Leaf size scales with segment depth (deeper = smaller)
            const depthFactor = Math.max(1.0 - seg.getDepth() * 0.15, 0.4);
            const leafSize = leaf.size * depthFactor;
            
            drawLeaf(ctx, lx, ly, seg.angle * 180 / Math.PI, leaf.side, v, leafSize);
        });
    }

    // Root hairs (fine details for roots)
    if (seg.isRoot && !seg.isBranch) {
        ctx.strokeStyle = v.rootColor + '70'; 
        ctx.lineWidth = 0.6;
        for (let d = 12; d < seg.length; d += 13) {
            const t = d / seg.length;
            const hx = seg.x + (seg.endX - seg.x) * t;
            const hy = seg.y + (seg.endY - seg.y) * t;
            for (const s of [1, -1]) {
                const ha = seg.angle + s * (Math.PI / 2 + (Math.random() - 0.5) * 0.3);
                ctx.beginPath(); 
                ctx.moveTo(hx, hy);
                ctx.lineTo(hx + Math.cos(ha) * 6, hy + Math.sin(ha) * 6); 
                ctx.stroke();
            }
        }
    }

    // Recursively draw all child segments (continuation and branches)
    for (const c of seg.children) drawSegment(ctx, c);
}

/* ----------------------------------------------------------
   Draw a single leaf with natural variation.
   Leaves alternate sides and have subtle angle/size variation.
---------------------------------------------------------- */
function drawLeaf(ctx, x, y, stemAngleDeg, side, v, sizeMultiplier = 1.0) {
    // Base leaf angle: perpendicular to stem + slight droop + random variation
    const baseAngle = stemAngleDeg + side * (85 + Math.random() * 10);  // 85-95° from stem
    const droop = 15 + Math.random() * 10;  // 15-25° droop for natural look
    const leafAngle = (baseAngle + droop * side) * Math.PI / 180;
    
    // Leaf dimensions based on variety and size multiplier
    const ls = v.leafScale * sizeMultiplier;
    let length, width;
    
    if (v.leafShape === 'broad') { 
        length = ls * 12; 
        width = ls * 7; 
    } else if (v.leafShape === 'narrow') { 
        length = ls * 16; 
        width = ls * 3.5; 
    } else if (v.leafShape === 'lance') { 
        length = ls * 10; 
        width = ls * 4.5; 
    } else { 
        length = ls * 9; 
        width = ls * 5; 
    }
    
    // Leaf position (offset from stem)
    const leafX = x + Math.cos(leafAngle) * length * 0.5;
    const leafY = y + Math.sin(leafAngle) * length * 0.5;
    
    // Draw leaf as filled ellipse with subtle gradient
    ctx.save();
    ctx.translate(leafX, leafY);
    ctx.rotate(leafAngle);
    
    // Leaf fill
    ctx.fillStyle = v.leafColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, length * 0.5, width * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Leaf outline (subtle)
    ctx.strokeStyle = v.stemColor + '99';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    
    // Central vein
    ctx.strokeStyle = v.stemColor + 'AA';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-length * 0.5, 0);
    ctx.lineTo(length * 0.5, 0);
    ctx.stroke();
    
    ctx.restore();
}

function drawLightOverlay(ctx, W, H, dir) {
    const pos = {
        top: { x: W / 2, y: 28, nx: 0, ny: 1 },
        bottom: { x: W / 2, y: H - 28, nx: 0, ny: -1 },
        left: { x: 28, y: H / 2, nx: 1, ny: 0 },
        right: { x: W - 28, y: H / 2, nx: -1, ny: 0 },
    }[dir];
    if (!pos) return;

    const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 58);
    g.addColorStop(0, 'rgba(255,220,50,0.42)'); g.addColorStop(1, 'rgba(255,220,50,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pos.x, pos.y, 58, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#FFD700'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 13, 0, Math.PI * 2); ctx.fill();

    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.strokeStyle = '#FFA500'; ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(pos.x + Math.cos(a) * 17, pos.y + Math.sin(a) * 17);
        ctx.lineTo(pos.x + Math.cos(a) * 25, pos.y + Math.sin(a) * 25); ctx.stroke();
    }

    const ba = Math.atan2(pos.ny, pos.nx);
    ctx.strokeStyle = 'rgba(255,220,50,0.14)'; ctx.lineWidth = 1;
    for (const off of [-0.22, 0, 0.22]) {
        const a = ba + off;
        ctx.beginPath();
        ctx.moveTo(pos.x + Math.cos(a) * 28, pos.y + Math.sin(a) * 28);
        ctx.lineTo(pos.x + Math.cos(a) * 130, pos.y + Math.sin(a) * 130); ctx.stroke();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.font = '11px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Light source', pos.x + pos.nx * 42, pos.y + pos.ny * 42);
}

function drawGravityArrow(ctx, W, H, g, isDark) {
    const ax = W - 38, ay = 44, len = 38 * g;
    const col = isDark ? 'rgba(255,110,110,0.75)' : 'rgba(190,45,45,0.70)';
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay + len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax, ay + len);
    ctx.lineTo(ax - 5, ay + len - 9); ctx.lineTo(ax + 5, ay + len - 9); ctx.closePath(); ctx.fill();
    ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('g = ' + g, ax, ay + len + 5);
}

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
    ctx.textBaseline = 'top'; ctx.fillText('Gravitropic response', W / 2, 8);
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
        ctx.strokeRect(-44, -72, 88, 144); ctx.restore();
    };

    drawCell(W * 0.3, H / 2, 0);
    drawCell(W * 0.7, H / 2, Math.PI / 5);

    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
    ctx.textBaseline = 'top'; ctx.fillText('Statocytes sense gravity', W / 2, 8);
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
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px - 28, py - 50, px - 68, py - 94); ctx.stroke();

    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
    ctx.textBaseline = 'top'; ctx.fillText('Phototropic response', W / 2, 8);
}

function drawChart() {
    const canvas = el('growthChart');
    if (!canvas) return;
    const { ctx, W, H } = hiDPI(canvas);
    const m = { top: 48, right: 48, bottom: 62, left: 68 };
    const cW = W - m.left - m.right, cH = H - m.top - m.bottom;
    const isDark = App.theme === 'dark';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
    ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('Plant Growth Over Time', W / 2, 14);

    const hasData = App.dataPoints.length >= 2;
    const hasCompare = App.compareMode && App.compareData.length >= 2;

    if (!hasData && !hasCompare) {
        ctx.font = '13px system-ui'; ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.textBaseline = 'middle';
        ctx.fillText('Run an experiment to collect data.', W / 2, H / 2); return;
    }

    const allData = hasCompare ? [...App.dataPoints, ...App.compareData] : App.dataPoints;
    const maxT = Math.max(...allData.map(p => p.time));
    const maxL = Math.max(...allData.map(p => Math.max(p.stemLen || 0, p.rootDep || 0)));
    const sx = t => m.left + (t / maxT) * cW;
    const sy = l => H - m.bottom - (l / maxL) * cH;

    for (let i = 0; i <= 5; i++) {
        const y = m.top + (i / 5) * cH;
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(W - m.right, y); ctx.stroke();
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.font = '11px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(((1 - i / 5) * maxL).toFixed(0), m.left - 8, y);
    }

    ctx.strokeStyle = isDark ? '#475569' : '#cbd5e1'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(m.left, m.top); ctx.lineTo(m.left, H - m.bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m.left, H - m.bottom); ctx.lineTo(W - m.right, H - m.bottom); ctx.stroke();

    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('Time (minutes)', W / 2, H - 2);

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (hasData) {
        if (App.chartToggles.stemLength) {
            ctx.strokeStyle = '#228B22'; ctx.lineWidth = 2.5;
            ctx.beginPath();
            App.dataPoints.forEach((p, i) => {
                i === 0 ? ctx.moveTo(sx(p.time), sy(p.stemLen)) : ctx.lineTo(sx(p.time), sy(p.stemLen));
            });
            ctx.stroke();
        }

        if (App.chartToggles.rootDepth) {
            ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 2.5;
            ctx.beginPath();
            App.dataPoints.forEach((p, i) => {
                i === 0 ? ctx.moveTo(sx(p.time), sy(p.rootDep)) : ctx.lineTo(sx(p.time), sy(p.rootDep));
            });
            ctx.stroke();
        }
    }

    if (hasCompare) {
        ctx.setLineDash([5, 3]);
        if (App.chartToggles.stemLength) {
            ctx.strokeStyle = '#228B2266'; ctx.lineWidth = 2;
            ctx.beginPath();
            App.compareData.forEach((p, i) => {
                i === 0 ? ctx.moveTo(sx(p.time), sy(p.stemLen)) : ctx.lineTo(sx(p.time), sy(p.stemLen));
            });
            ctx.stroke();
        }
        if (App.chartToggles.rootDepth) {
            ctx.strokeStyle = '#8B451366'; ctx.lineWidth = 2;
            ctx.beginPath();
            App.compareData.forEach((p, i) => {
                i === 0 ? ctx.moveTo(sx(p.time), sy(p.rootDep)) : ctx.lineTo(sx(p.time), sy(p.rootDep));
            });
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    const lx = W - m.right - 140, ly = m.top + 14;
    let lyOffset = 0;

    if (App.chartToggles.stemLength) {
        ctx.fillStyle = '#228B22'; ctx.fillRect(lx, ly + lyOffset, 18, 3);
        ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
        ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('Stem length', lx + 24, ly + lyOffset + 1); lyOffset += 16;
    }

    if (App.chartToggles.rootDepth) {
        ctx.fillStyle = '#8B4513'; ctx.fillRect(lx, ly + lyOffset, 18, 3);
        ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
        ctx.fillText('Root depth', lx + 24, ly + lyOffset + 1); lyOffset += 16;
    }

    if (hasCompare) {
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.font = '10px system-ui';
        ctx.fillText('(dashed = Earth)', lx, ly + lyOffset + 8);
    }
}

function startExperiment() {
    if (App.isRunning) return;

    App.camera = { scale: 1, targetScale: 1, panY: 0, targetPanY: 0 };
    App.plant = new Plant(App.variety, App.gravity, App.lightDir);
    App.isRunning = true;
    App.isComplete = false;
    App.startTime = Date.now() - App.elapsedMs;

    el('predictionText').disabled = true;

    if (App.compareMode && App.gravity !== 1) {
        App.comparePlant = new Plant(App.variety, 1, App.lightDir);
    } else {
        App.comparePlant = null; App.compareData = [];
    }

    el('startExperiment').disabled = true;
    el('stopExperiment').disabled = false;
    document.querySelectorAll('.plant-card').forEach(c => c.disabled = true);
    document.querySelectorAll('.gravity-btn').forEach(b => b.disabled = true);

    logObs('Experiment started — ' + VARIETIES[App.variety].label + ', ' + (App.gravity === 1 ? 'Earth (1g)' : 'Microgravity (0g)'));
    animate();
}

function stopExperiment() {
    App.isRunning = false;
    el('startExperiment').disabled = false;
    el('stopExperiment').disabled = true;
    logObs('Paused at ' + fmtTime(App.elapsedMs));
    recordPoint();
}

function resetExperiment() {
    App.isRunning = false; App.isComplete = false;
    cancelAnimationFrame(App.animId);
    App.elapsedMs = 0; App.plant = null; App.comparePlant = null;
    App.camera = { scale: 1, targetScale: 1, panY: 0, targetPanY: 0 };
    App.zoom = { level: 1, targetLevel: 1 };

    el('predictionText').disabled = false;

    el('startExperiment').disabled = false;
    el('stopExperiment').disabled = true;
    document.querySelectorAll('.plant-card').forEach(c => c.disabled = false);
    document.querySelectorAll('.gravity-btn').forEach(b => b.disabled = false);
    el('elapsedTime').textContent = '0:00';

    setVal('stemLengthVal', '0 mm');
    setVal('rootDepthVal', '0 mm');
    setVal('branchCountVal', '0');
    setVal('growthPhaseVal', 'Germination');
    setVal('tropismVal', '—');
    setVal('zoomVal', '100%');

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

        if (!App.isComplete && App.plant.isFullyGrown()) {
            App.isComplete = true; App.isRunning = false;
            el('startExperiment').disabled = true;
            el('stopExperiment').disabled = true;
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
    if (App.isRunning) App.animId = requestAnimationFrame(animate);
}

function updateLiveData() {
    if (!App.plant) return;
    const stemLen = App.plant.shoot.totalLength().toFixed(1);
    const rootDep = App.plant.root.totalLength().toFixed(1);
    
    // Count branches recursively
    const countBranches = (seg) => {
        let count = 0;
        for (const child of seg.children) {
            if (child.isBranch) count++;
            count += countBranches(child);
        }
        return count;
    };
    const branches = countBranches(App.plant.shoot);
    
    const ratio = App.plant.shoot.length / App.plant.shoot.targetLength;
    const phase = ratio < 0.05 ? 'Germination'
                : App.plant.shoot.totalLength() < 40 ? 'Early growth'
                : App.plant.shoot.totalLength() < 120 ? 'Rapid growth'
                : App.plant.shoot.totalLength() < 200 ? 'Maturation'
                : 'Mature';
    const tropism = App.gravity === 0
        ? (App.lightDir !== 'none' ? 'Phototropism' : 'Undirected')
        : (App.lightDir !== 'none' ? 'Grav. + Photo.' : 'Gravitropism');

    setVal('stemLengthVal', stemLen + ' mm');
    setVal('rootDepthVal', rootDep + ' mm');
    setVal('branchCountVal', branches);
    setVal('growthPhaseVal', phase);
    setVal('tropismVal', tropism);
}

function recordPoint() {
    if (!App.plant) return;
    
    // Count branches recursively
    const countBranches = (seg) => {
        let count = 0;
        for (const child of seg.children) {
            if (child.isBranch) count++;
            count += countBranches(child);
        }
        return count;
    };
    
    App.dataPoints.push({
        time: App.elapsedMs / 60000,
        variety: App.variety,
        gravity: App.gravity,
        light: App.lightDir,
        stemLen: parseFloat(App.plant.shoot.totalLength().toFixed(1)),
        rootDep: parseFloat(App.plant.root.totalLength().toFixed(1)),
        branches: countBranches(App.plant.shoot)
    });
    updateTable(); drawChart();
}

function recordComparePoint() {
    if (!App.comparePlant) return;
    App.compareData.push({
        time: App.elapsedMs / 60000,
        stemLen: parseFloat(App.comparePlant.shoot.totalLength().toFixed(1)),
        rootDep: parseFloat(App.comparePlant.root.totalLength().toFixed(1)),
    });
    drawChart();
}

function updateTable() {
    const tbody = el('dataTableBody');
    tbody.innerHTML = '';
    if (!App.dataPoints.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-table">No data recorded yet.</td></tr>';
        return;
    }
    for (const p of App.dataPoints) {
        const tr = tbody.insertRow();
        [p.time.toFixed(2),
         VARIETIES[p.variety]?.label || p.variety,
         p.gravity + 'g',
         p.stemLen,
         p.rootDep,
         p.branches
        ].forEach(v => { tr.insertCell().textContent = v; });
    }
}

function exportData() {
    if (!App.dataPoints.length) { alert('No data to export yet.'); return; }
    let csv = 'Time (min),Variety,Gravity,Light,Stem Length (mm),Root Depth (mm),Branches\n';
    for (const p of App.dataPoints) {
        csv += [p.time.toFixed(2), VARIETIES[p.variety]?.label || p.variety,
                p.gravity, p.light, p.stemLen, p.rootDep, p.branches].join(',') + '\n';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'plant_growth_data.csv'; a.click();
    URL.revokeObjectURL(a.href);
}

function clearData() {
    if (confirm('Clear all recorded data?')) {
        App.dataPoints = []; App.compareData = [];
        updateTable(); drawChart();
    }
}

function logObs(msg) {
    const log = el('observationsLog');
    const ph = log.querySelector('.initial');
    if (ph) ph.remove();
    const p = document.createElement('p');
    p.className = 'observation-entry';
    p.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
}

function initAccordion() {
    document.querySelectorAll('.accordion-header').forEach(h => {
        h.addEventListener('click', () => {
            const item = h.parentElement;
            const was = item.classList.contains('active');
            document.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('active'));
            if (!was) item.classList.add('active');
        });
    });
}

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
    drawChart(); renderCanvas(); drawAllDiagrams();
}

function el(id) { return document.getElementById(id); }
function setVal(id, v) { const e = el(id); if (e) e.textContent = v; }
function fmtTime(ms) { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function dirToRad(dir) { return { top: -Math.PI / 2, bottom: Math.PI / 2, left: Math.PI, right: 0 }[dir] ?? 0; }
function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
}
function collectPts(seg, out) {
    out.push({ x: seg.x, y: seg.y }, { x: seg.endX, y: seg.endY });
    seg.children.forEach(c => collectPts(c, out));
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initAccordion();
    initStarField();
    initZoom();
    drawAllDiagrams();
    renderCanvas();
    drawChart();

    el('startExperiment')?.addEventListener('click', startExperiment);
    el('stopExperiment')?.addEventListener('click', stopExperiment);
    el('resetExperiment')?.addEventListener('click', resetExperiment);
    el('exportCSV')?.addEventListener('click', exportData);
    el('clearData')?.addEventListener('click', clearData);

    document.querySelectorAll('.gravity-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const newGravity = parseFloat(this.dataset.gravity);
            if (App.gravity !== newGravity) {
                App.gravity = newGravity;
                document.querySelectorAll('.gravity-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                App.compareMode = (newGravity === 0);
                logObs('Gravity changed to: ' + (newGravity === 1 ? 'Earth (1g)' : 'Microgravity (0g)'));
            }
        });
    });

    document.querySelectorAll('.plant-card').forEach(card => {
        card.addEventListener('click', function() {
            document.querySelectorAll('.plant-card').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            App.variety = this.dataset.variety;
            logObs('Plant variety changed to: ' + VARIETIES[App.variety].label);
        });
    });

    document.querySelectorAll('.light-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.light-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            App.lightDir = this.dataset.direction;
            if (App.isRunning) logObs('Light source changed to: ' + App.lightDir);
            renderCanvas();
        });
    });

    el('showStemLength')?.addEventListener('change', e => {
        App.chartToggles.stemLength = e.target.checked; drawChart();
    });
    el('showRootDepth')?.addEventListener('change', e => {
        App.chartToggles.rootDepth = e.target.checked; drawChart();
    });

    document.querySelectorAll('.nav-links a').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
        });
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            renderCanvas(); drawChart(); drawAllDiagrams();
        }, 120);
    });
});
