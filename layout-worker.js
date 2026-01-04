
const CONFIG = {
    MIN_YEAR: -2070,
    MAX_YEAR: 2025,
    ROW_HEIGHT: 24,
    COL_WIDTH: 100
};

const simpleHash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i); return (h >>> 0).toString(36); };

class AdvancedColumnSorter {
    constructor(ids, grid, names, onLog, bonusMatrix = null) {
        this.ids = ids; this.grid = grid; this.names = names; this.onLog = onLog;
        this.matrix = null;
        this.bonusMatrix = bonusMatrix; // [New] 用于注入视角偏好
    }
    async precompute() {
        const n = this.ids.length;
        this.matrix = Array(n).fill(0).map(() => Array(n).fill(0));
        let ops = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                let score = 0;
                const rA = this.ids[i], rB = this.ids[j];

                // [New] 优先应用强绑定 Bonus
                if (this.bonusMatrix && this.bonusMatrix[i] && this.bonusMatrix[i][j]) {
                    score += this.bonusMatrix[i][j];
                }

                for (let y = CONFIG.MIN_YEAR; y <= CONFIG.MAX_YEAR; y++) {
                    const setA = this.grid[rA]?.[y];
                    const setB = this.grid[rB]?.[y];
                    if (setA && setB) {
                        let common = 0;
                        setA.forEach(r => { if (setB.has(r)) common++; });
                        if (common > 0) {
                            const nA = setA.size;
                            const nB = setB.size;
                            const complexityFactor = 2.0 / (nA + nB);
                            score += (common * 10 * complexityFactor);
                        }
                    }
                }
                this.matrix[i][j] = this.matrix[j][i] = score;
                ops++; if (ops % 500 === 0) await new Promise(r => setTimeout(r, 0));
            }
        }
    }
    getPathScore(path) {
        let score = 0;
        const n = path.length;
        for (let i = 0; i < n - 1; i++) score += this.matrix[path[i]][path[i + 1]];
        return score;
    }
    async greedyInit() {
        const n = this.ids.length;
        let bestPath = null, bestScore = -1;
        // 暴力尝试以每个点为起点
        for (let startNode = 0; startNode < n; startNode++) {
            const visited = new Set([startNode]);
            const path = [startNode];
            let current = startNode;
            while (path.length < n) {
                let bestNext = -1, maxSim = -1;
                for (let candidate = 0; candidate < n; candidate++) {
                    if (!visited.has(candidate)) {
                        const sim = this.matrix[current][candidate];
                        if (sim > maxSim) { maxSim = sim; bestNext = candidate; }
                    }
                }
                if (bestNext === -1) for (let k = 0; k < n; k++) if (!visited.has(k)) { bestNext = k; break; }
                visited.add(bestNext); path.push(bestNext); current = bestNext;
            }
            const s = this.getPathScore(path);
            if (s > bestScore) { bestScore = s; bestPath = path; }
            if (startNode % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }
        return { path: bestPath, score: bestScore };
    }
    // [Optimized] 减少默认迭代次数，使用基于时间的 Yield
    async run(iterations = 200000000, updateCallback, stopRef, initialPathIds = null) {
        this.onLog(`TSP: 启动高强度计算 (Iter: ${(iterations / 1000000).toFixed(0)}M)...`);

        let init;
        if (initialPathIds && initialPathIds.length === this.ids.length) {
            // Convert ID string array back to index array
            const idxMap = new Map();
            this.ids.forEach((id, idx) => idxMap.set(id, idx));

            const idxPath = initialPathIds.map(id => idxMap.get(id));
            if (idxPath.some(x => x === undefined)) {
                this.onLog("⚠️ 现有列顺序数据异常，回退至贪心初始化...");
                init = await this.greedyInit(); // Fallback
            } else {
                const score = this.getPathScore(idxPath);
                this.onLog(`🔄 继承现有列顺序作为起点 (Score: ${score})`);
                init = { path: idxPath, score: score };
            }
        } else {
            init = await this.greedyInit(); // Start with a good greedy solution
        }

        // --- Core State ---
        let currentPath = [...init.path];
        let currentScore = init.score;
        let bestPath = [...currentPath];
        let bestScore = currentScore;

        // --- Elite Pool (Diversity Preservation) ---
        // Maintain Top 5 distinct solutions to jump between
        const elitePool = [];
        const addToElite = (path, score) => {
            // Check similarity (Hamming distance or simple exact match)
            const isSimilar = elitePool.some(e => Math.abs(e.score - score) < 1 && e.path.join() === path.join());
            if (!isSimilar) {
                elitePool.push({ path: [...path], score });
                elitePool.sort((a, b) => b.score - a.score);
                if (elitePool.length > 5) elitePool.pop();
            }
        };
        addToElite(bestPath, bestScore);

        // --- Tabu Search (Short-term Memory) ---
        // Pre-allocate a small circular buffer for tabu hashes
        const tabuSize = 20;
        const tabuList = new Int32Array(tabuSize);
        let tabuPtr = 0;
        const addTabu = (path) => {
            // Simple hash of first, middle, last elements
            const h = path[0] ^ path[path.length >> 1] ^ path[path.length - 1];
            tabuList[tabuPtr] = h;
            tabuPtr = (tabuPtr + 1) % tabuSize;
        };
        const isTabu = (path) => {
            const h = path[0] ^ path[path.length >> 1] ^ path[path.length - 1];
            for (let i = 0; i < tabuSize; i++) if (tabuList[i] === h) return true;
            return false;
        };

        // SA Params
        let temp = 500.0;
        const cooling = 0.999;
        let lastImprovement = 0;
        const n = this.ids.length;

        // Performance Control
        let lastYieldTime = performance.now();
        let lastUIUpdateTime = performance.now();

        for (let i = 0; i < iterations; i++) {
            if (stopRef.current) break;

            const moveType = Math.random();
            let newPath = [...currentPath];
            let delta = 0;
            let isFullCalc = false;

            // --- Mutation Strategies ---
            if (moveType < 0.6) {
                // === 2-Opt (60%) ===
                const idx1 = Math.floor(Math.random() * n);
                const idx2 = Math.floor(Math.random() * n);
                const s = Math.min(idx1, idx2), e = Math.max(idx1, idx2);
                if (s === e) continue;

                // Delta Calculation
                const nA = s > 0 ? currentPath[s - 1] : -1, nB = currentPath[s];
                const nC = currentPath[e], nD = e < n - 1 ? currentPath[e + 1] : -1;
                let oldSim = 0; if (nA !== -1) oldSim += this.matrix[nA][nB]; if (nD !== -1) oldSim += this.matrix[nC][nD];
                let newSim = 0; if (nA !== -1) newSim += this.matrix[nA][nC]; if (nD !== -1) newSim += this.matrix[nB][nD];
                delta = newSim - oldSim;

                if (delta > 0 || Math.random() < Math.exp(delta / temp)) {
                    // Apply Reversal
                    let l = s, r = e;
                    while (l < r) { [newPath[l], newPath[r]] = [newPath[r], newPath[l]]; l++; r--; }
                    // 2-Opt doesn't need isFullCalc if delta is correct, but let's trust delta
                } else {
                    continue; // Rejected
                }
            }
            else if (moveType < 0.8) {
                // === Insertion (20%) ===
                // Good for moving a single misaligned region
                const from = Math.floor(Math.random() * n);
                let to = Math.floor(Math.random() * n);
                while (to === from) to = Math.floor(Math.random() * n);

                const [node] = newPath.splice(from, 1);
                newPath.splice(to, 0, node);
                isFullCalc = true;
            }
            else {
                // === Double Bridge (20%) ===
                // Strong non-reversible kick (A B C D -> A D C B)
                // Improves topological structure
                const pos1 = 1 + Math.floor(Math.random() * (n / 4));
                const pos2 = pos1 + 1 + Math.floor(Math.random() * (n / 4));
                const pos3 = pos2 + 1 + Math.floor(Math.random() * (n / 4));

                if (pos3 < n - 1) {
                    const chunkA = newPath.slice(0, pos1);
                    const chunkB = newPath.slice(pos1, pos2);
                    const chunkC = newPath.slice(pos2, pos3);
                    const chunkD = newPath.slice(pos3);
                    newPath = [...chunkA, ...chunkD, ...chunkC, ...chunkB];
                    isFullCalc = true;
                } else {
                    continue;
                }
            }

            // --- Acceptance Logic ---
            if (isFullCalc) {
                const newScore = this.getPathScore(newPath);
                delta = newScore - currentScore;
                if (delta > 0 || Math.random() < Math.exp(delta / temp)) {
                    // Accept
                } else {
                    continue; // Reject
                }
            } else {
                // If we are here, 2-Opt was already accepted based on delta
            }

            // --- Update Current State ---
            // Tabu Check: Don't go back immediately unless it's a breakthrough
            if (!isTabu(newPath) || (currentScore + delta > bestScore)) {
                if (isFullCalc) {
                    currentPath = newPath;
                    currentScore = this.getPathScore(newPath);
                } else {
                    // For 2-opt, newPath was modified in place above (if we used a copy appropriately)
                    // But wait, my 2-opt above modified 'newPath' but currentPath was separate.
                    // FIX: Need to update currentPath from newPath
                    currentPath = newPath;
                    currentScore += delta;
                }

                addTabu(currentPath);

                // --- Update Global Best ---
                if (currentScore > bestScore) {
                    bestScore = currentScore;
                    bestPath = [...currentPath];
                    lastImprovement = i;
                    addToElite(bestPath, bestScore);

                    // Throttle UI Updates (High Priority)
                    if (updateCallback && (i - lastImprovement < 100)) updateCallback(null, bestScore);
                }
            }

            // --- Annealing Schedule ---
            if (i % 500 === 0) temp *= cooling;

            // --- Advanced ILS Strategy (Kick & Diversity) ---
            // If stuck for too long (e.g. 500k iters), Force Jump
            if (temp < 0.1 || (i - lastImprovement > 300000)) {
                // Strategy 1: Jump to a random Elite (Diversity)
                if (elitePool.length > 0 && Math.random() < 0.5) {
                    const elite = elitePool[Math.floor(Math.random() * elitePool.length)];
                    currentPath = [...elite.path];
                    currentScore = elite.score;
                    // this.onLog(`[ILS] Jumping to Elite Score: ${currentScore}`);
                } else {
                    // Strategy 2: Back to Best (Intensification)
                    currentPath = [...bestPath];
                    currentScore = bestScore;
                }

                // Apply Smart Kick: Double Bridge (Strong Perturbation)
                // A standard 4-opt move that cannot be undone by simple 2-opt
                const pos1 = Math.floor(n / 4);
                const pos2 = Math.floor(n / 2);
                const pos3 = Math.floor(3 * n / 4);
                const chunkA = currentPath.slice(0, pos1);
                const chunkB = currentPath.slice(pos1, pos2);
                const chunkC = currentPath.slice(pos2, pos3);
                const chunkD = currentPath.slice(pos3);
                // Shuffle chunks order
                currentPath = [...chunkA, ...chunkD, ...chunkB, ...chunkC];

                // Recalc Score & Reset Temp
                currentScore = this.getPathScore(currentPath);
                temp = 200.0 + Math.random() * 100; // Randomize reheat
                lastImprovement = i;
            }

            // --- UI Yielding ---
            if (i % 4000 === 0) {
                const now = performance.now();
                if (now - lastYieldTime > 12) {
                    if (now - lastUIUpdateTime > 1000) {
                        this.onLog(`TSP Iter ${(i / 1000000).toFixed(2)}M: Temp ${temp.toFixed(1)} | Best ${bestScore} | Elite: ${elitePool.length}`);
                        if (updateCallback) updateCallback(null, bestScore);
                        lastUIUpdateTime = now;
                        await new Promise(r => setTimeout(r, 0));
                    } else {
                        await new Promise(r => setTimeout(r, 0));
                    }
                    lastYieldTime = performance.now();
                }
            }
        } // End Loop

        // --- Final Geo-Correction ---
        if (this.names) {
            const eastKeywords = ['hokkaido', '北海道', 'japan', '日本', 'nihon'];
            let eastIndexSum = 0, eastCount = 0;
            bestPath.forEach((idx, pos) => {
                const id = this.ids[idx];
                const name = (this.names[id] || id).toLowerCase();
                if (eastKeywords.some(k => name.includes(k))) { eastIndexSum += pos; eastCount++; }
            });
            if (eastCount > 0) {
                const avgPos = eastIndexSum / eastCount;
                if (avgPos < n / 2) {
                    this.onLog(`地理修正: 东方板块居左 (${avgPos.toFixed(1)} < ${n / 2}) -> 翻转`);
                    bestPath.reverse();
                }
            }
        }

        return { path: bestPath.map(idx => this.ids[idx]), score: bestScore };
    }
}

class GlobalSequenceOptimizer {
    constructor(colOrder, grid, onLog) {
        this.cols = colOrder;
        this.rawGrid = grid; // Keep raw grid for reference
        this.onLog = onLog;
        this.masterSeqs = {}; // NOW MAPS COL_ID -> ARRAY<INT_ID>
        this.activeSets = {}; // NOW MAPS COL_ID -> YEAR -> SET<INT_ID>

        // [Optimization 3] Integer Mappings
        this.strToInt = new Map();
        this.intToStr = [];
        this.fuzzyRoots = null; // Int32Array: ID -> ParentID (for fuzzy matching)

        // Cache
        this.pairScores = {};
        this.stabilityScores = {};
        this.cutoffYears = [];
        this.activeSetsByYear = {};
    }

    // [New] Build Integer Dictionary & Fuzzy Roots
    _buildIntegerMap() {
        const all = new Set();
        this.cols.forEach(id => {
            const rawCol = this.rawGrid[id];
            if (!rawCol) return;
            for (let y in rawCol) {
                // grid[col][y] is a Set or Array
                rawCol[y].forEach(r => all.add(r));
            }
        });

        // Sort for deterministic behavior
        this.intToStr = Array.from(all).sort();
        this.intToStr.forEach((r, i) => this.strToInt.set(r, i));

        // Build Fuzzy Roots (Precomputed)
        const N = this.intToStr.length;
        this.fuzzyRoots = new Int32Array(N);

        // Helper map for Virtual Roots (bases that don't exist in grid)
        const virtualRoots = new Map();
        let nextVirtualId = -1;

        for (let i = 0; i < N; i++) {
            const r = this.intToStr[i];
            const idx = r.indexOf('|');
            let rootId = i; // Default to self

            if (idx !== -1) {
                const base = r.substring(0, idx);
                if (this.strToInt.has(base)) {
                    // Base exists as a real regime
                    rootId = this.strToInt.get(base);
                } else {
                    // Base is virtual (not in grid)
                    if (!virtualRoots.has(base)) {
                        virtualRoots.set(base, nextVirtualId--);
                    }
                    rootId = virtualRoots.get(base);
                }
            }
            this.fuzzyRoots[i] = rootId;
        }

        this.onLog(`[SeqOpt] Integer Map Built. ${N} unique regimes. Virtual Roots: ${virtualRoots.size}`);
    }

    init(existingMasterSeqs = null) {
        // 1. infrastructure
        this._buildIntegerMap();

        // 2. Build Integer Grid (activeSets)
        let loadedCount = 0;
        let totalSlots = 0;
        let filledSlots = 0;

        this.cols.forEach(id => {
            this.activeSets[id] = {};
            const rawCol = this.rawGrid[id];
            const colRegimes = new Set(); // Ints seen in this col

            if (rawCol) {
                for (let y = CONFIG.MIN_YEAR; y <= CONFIG.MAX_YEAR; y++) {
                    const rawSet = rawCol[y];
                    if (rawSet) {
                        const intSet = new Set(); // Use Set<Int> for fast .has
                        rawSet.forEach(r => {
                            const mapId = this.strToInt.get(r);
                            intSet.add(mapId);
                            colRegimes.add(mapId);
                        });
                        this.activeSets[id][y] = intSet;
                        // Stats
                        totalSlots++;
                        filledSlots += intSet.size;
                    }
                }
            }

            // 3. Init Master Seqs (Integer conversion)
            if (existingMasterSeqs && existingMasterSeqs[id]) {
                loadedCount++;
                const oldSeq = existingMasterSeqs[id];
                const newSeq = [];
                const seenInSeq = new Set();

                // Map old strings to current Ints
                oldSeq.forEach(rStr => {
                    // Try exact match
                    if (this.strToInt.has(rStr)) {
                        const idVal = this.strToInt.get(rStr);
                        // Verify it belongs to this column now (it might have disappeared in data update)
                        if (colRegimes.has(idVal)) {
                            newSeq.push(idVal);
                            seenInSeq.add(idVal);
                        }
                    }
                    // Else: Logic for Dash->Pipe or fuzzy recovery? 
                    // Skipped for simplicity in Int version, can add if needed.
                });

                // Append missing
                const missing = Array.from(colRegimes).filter(idVal => !seenInSeq.has(idVal));
                this.masterSeqs[id] = [...newSeq, ...missing];
            } else {
                // Random
                this.masterSeqs[id] = Array.from(colRegimes).sort(() => Math.random() - 0.5);
            }
        });

        if (existingMasterSeqs) {
            this.onLog(`[Init] Loaded ${loadedCount}/${this.cols.length} cols.`);
        }

        // 4. Calculate Cutoff Years
        const changeYears = new Set();
        changeYears.add(CONFIG.MIN_YEAR);

        this.cols.forEach(id => {
            let lastSig = "";
            for (let y = CONFIG.MIN_YEAR; y <= CONFIG.MAX_YEAR; y++) {
                const set = this.activeSets[id]?.[y]; // Set<Int>
                // Signature: Sorted CSV of Ints
                let sig = "";
                if (set && set.size > 0) {
                    // Array.from(Set) is slow inside loop?
                    // Max size ~20. It's okay.
                    const sorted = Array.from(set).sort((a, b) => a - b);
                    sig = sorted.join(',');
                }
                if (sig !== lastSig) {
                    changeYears.add(y);
                    lastSig = sig;
                }
            }
        });

        this.cutoffYears = Array.from(changeYears).sort((a, b) => a - b);

        // 5. Weights Tuning
        const density = totalSlots > 0 ? filledSlots / totalSlots : 0.1;
        this.weights = {
            stability: 50,
            continuity: 0.1,
            adjacency: 2.0,
            gap: 0.2
        };
        if (density < 0.2) {
            this.weights.gap = 0.4;
            this.weights.adjacency = 3.0;
            this.weights.stability = 30;
        } else if (density > 0.8) {
            this.weights.gap = 0.1;
            this.weights.stability = 80;
        }

        // [New] Precompute Matrix after weights are set
        this._precomputeContinuityMatrix();

        this.onLog(`SeqOpt (Int): ${this.cutoffYears.length} Keyframes. Density: ${density.toFixed(2)}`);
    }



    // [Optimization 4] Precompute Continuity Scores
    // This eliminates the need to loop through years to calculate basic connectivity score
    _precomputeContinuityMatrix() {
        // Cache structure: colPairIndex (0..cols-1) -> Map<RegimeID, Score>
        this.continuityCache = new Array(this.cols.length - 1);

        const wCont = this.weights.continuity;

        for (let c = 0; c < this.cols.length - 1; c++) {
            const idA = this.cols[c];
            const idB = this.cols[c + 1];
            const scoreMap = new Float32Array(this.intToStr.length); // Direct ID access

            // Loop all intervals
            const count = this.cutoffYears.length;
            for (let i = 0; i < count; i++) {
                const y = this.cutoffYears[i];
                const nextY = (i < count - 1) ? this.cutoffYears[i + 1] : CONFIG.MAX_YEAR;
                const duration = nextY - y;
                const scoreDelta = duration * wCont;

                const setA = this.activeSets[idA][y]; // Set<Int>
                const setB = this.activeSets[idB][y]; // Set<Int>

                if (!setA || !setB) continue;

                // Intersection with Fuzzy Logic
                // Iterate smaller set for efficiency? activeSets are usually small (<20).
                setA.forEach(rA => {
                    // Check strict match
                    if (setB.has(rA)) {
                        scoreMap[rA] += scoreDelta;
                    } else {
                        // Check fuzzy match
                        const rootA = this.fuzzyRoots[rA];
                        // Does setB contain any Regime with same Root?
                        // This scan O(M) is okay inside Init.
                        for (const rB of setB) {
                            if (this.fuzzyRoots[rB] === rootA) {
                                scoreMap[rA] += scoreDelta; // Credit goes to rA
                                break;
                            }
                        }
                    }
                });
            }
            this.continuityCache[c] = scoreMap;
        }
        this.onLog(`[SeqOpt] Continuity Matrix Precomputed.`);
    }

    // [Step 2] Integer-based Greedy Construct using Barycenter Heuristic
    greedyConstruct() {
        this.onLog(`[Greedy] 开始增强版贪心构造 (整数版)...`);
        this._precomputeContinuityMatrix(); // Ensure matrix is ready

        const result = {};

        // === Phase 1: Determine "Year Center" for each regime (Int ID) ===
        // Maps ID -> Average Year
        const regimeCenterYear = new Float32Array(this.intToStr.length);
        const regimeCounts = new Int32Array(this.intToStr.length);

        this.cols.forEach(colId => {
            for (let y = CONFIG.MIN_YEAR; y <= CONFIG.MAX_YEAR; y++) {
                const set = this.activeSets[colId]?.[y];
                if (set) {
                    set.forEach(r => {
                        regimeCenterYear[r] += y;
                        regimeCounts[r]++;
                    });
                }
            }
        });

        // Normalize
        for (let i = 0; i < regimeCenterYear.length; i++) {
            if (regimeCounts[i] > 0) regimeCenterYear[i] /= regimeCounts[i];
        }

        // === Phase 2: Sort based on Center Year (Topological Init) ===
        this.cols.forEach(colId => {
            const seq = this.masterSeqs[colId]; // Array<Int>
            // Sort by center year first
            seq.sort((a, b) => regimeCenterYear[a] - regimeCenterYear[b]);
            result[colId] = seq;
        });

        // Update global state
        // Deep copy not needed for Int arrays technically? but let's be safe
        // result is just reference to masterSeqs arrays which we mutated in place.
        // Actually, greedyConstruct returning `currentSeqs` object is expected.

        const newSeqs = {};
        this.cols.forEach(col => {
            newSeqs[col] = [...this.masterSeqs[col]];
        });

        return newSeqs;
    }


    // [NEW] 潜力导向的针对性修复
    // 识别可以对齐但未对齐的共享政权，系统性地尝试修复
    targetedRepair(seqs, maxRounds = 50) {
        this.onLog(`[TargetedRepair] 开始潜力扫描...`);
        let currentSeqs = JSON.parse(JSON.stringify(seqs));
        let currentScore = this.calculateGlobalScore(currentSeqs);
        let improvements = 0;

        for (let round = 0; round < maxRounds; round++) {
            // === Step 1: 计算所有"未兑现潜力" ===
            const potentials = [];

            for (let c = 0; c < this.cols.length - 1; c++) {
                const idA = this.cols[c];
                const idB = this.cols[c + 1];
                const seqA = currentSeqs[idA];
                const seqB = currentSeqs[idB];

                if (!seqA || !seqB) continue;

                // 构建位置映射
                const mapA = new Map();
                seqA.forEach((r, idx) => mapA.set(r, idx));
                const mapB = new Map();
                seqB.forEach((r, idx) => mapB.set(r, idx));

                // 遍历所有关键年份
                for (const y of this.cutoffYears) {
                    const setA = this.activeSets[idA]?.[y];
                    const setB = this.activeSets[idB]?.[y];
                    if (!setA || !setB) continue;

                    // 找共享政权
                    setA.forEach(r => {
                        if (setB.has(r) && mapA.has(r) && mapB.has(r)) {
                            const idxA = mapA.get(r);
                            const idxB = mapB.get(r);

                            // 计算当前Y年的活跃政权列表
                            const activeA = seqA.filter(x => setA.has(x));
                            const activeB = seqB.filter(x => setB.has(x));

                            const posA = activeA.indexOf(r);
                            const posB = activeB.indexOf(r);

                            if (posA === -1 || posB === -1) return;

                            const distA = activeA.length - 1 - posA; // 离右边缘的距离
                            const distB = posB; // 离左边缘的距离
                            const gap = distA + distB;

                            if (gap > 0) {
                                // 计算潜力 = gap * duration
                                const nextY = this.cutoffYears[this.cutoffYears.indexOf(y) + 1] || CONFIG.MAX_YEAR;
                                const duration = nextY - y;

                                potentials.push({
                                    regime: r,
                                    colIdxA: c,
                                    colIdxB: c + 1,
                                    idA, idB,
                                    idxA, idxB,
                                    gap,
                                    potential: gap * duration,
                                    year: y,
                                    // 阻挡者：在A列中阻止r到达右边缘的政权
                                    blockersA: activeA.slice(posA + 1),
                                    // 阻挡者：在B列中阻止r到达左边缘的政权
                                    blockersB: activeB.slice(0, posB)
                                });
                            }
                        }
                    });
                }
            }

            if (potentials.length === 0) {
                this.onLog(`[TargetedRepair] 第 ${round + 1} 轮: 无未兑现潜力。`);
                break;
            }

            // === Step 2: 按潜力从大到小排序 ===
            potentials.sort((a, b) => b.potential - a.potential);

            // === Step 3: 尝试兑现最大潜力 ===
            let improved = false;

            for (let i = 0; i < Math.min(10, potentials.length); i++) {
                const p = potentials[i];

                // 尝试策略1: 在A列中，把阻挡者移到r前面
                if (p.blockersA.length > 0) {
                    const seqA = currentSeqs[p.idA];
                    const rIdx = seqA.indexOf(p.regime);

                    // 找到第一个阻挡者
                    for (const blocker of p.blockersA) {
                        const blockerIdx = seqA.indexOf(blocker);
                        if (blockerIdx > rIdx) {
                            // 尝试把 blocker 移到 r 前面
                            const newSeqA = [...seqA];
                            newSeqA.splice(blockerIdx, 1); // 移除 blocker
                            const newRIdx = newSeqA.indexOf(p.regime);
                            newSeqA.splice(newRIdx, 0, blocker); // 插入到 r 前面

                            // 评估分数变化
                            const oldScore = this.calculateColumnStability(p.idA, seqA) +
                                (p.colIdxA > 0 ? this.calculatePairScore(this.cols[p.colIdxA - 1], p.idA, currentSeqs[this.cols[p.colIdxA - 1]], seqA) : 0) +
                                this.calculatePairScore(p.idA, p.idB, seqA, currentSeqs[p.idB]);

                            const newScore = this.calculateColumnStability(p.idA, newSeqA) +
                                (p.colIdxA > 0 ? this.calculatePairScore(this.cols[p.colIdxA - 1], p.idA, currentSeqs[this.cols[p.colIdxA - 1]], newSeqA) : 0) +
                                this.calculatePairScore(p.idA, p.idB, newSeqA, currentSeqs[p.idB]);

                            if (newScore > oldScore) {
                                currentSeqs[p.idA] = newSeqA;
                                improvements++;
                                improved = true;
                                break;
                            }
                        }
                    }
                }

                // 尝试策略2: 在B列中，把阻挡者移到r后面
                if (!improved && p.blockersB.length > 0) {
                    const seqB = currentSeqs[p.idB];
                    const rIdx = seqB.indexOf(p.regime);

                    for (const blocker of p.blockersB) {
                        const blockerIdx = seqB.indexOf(blocker);
                        if (blockerIdx < rIdx) {
                            // 尝试把 blocker 移到 r 后面
                            const newSeqB = [...seqB];
                            newSeqB.splice(blockerIdx, 1);
                            const newRIdx = newSeqB.indexOf(p.regime);
                            newSeqB.splice(newRIdx + 1, 0, blocker);

                            const oldScore = this.calculateColumnStability(p.idB, seqB) +
                                this.calculatePairScore(p.idA, p.idB, currentSeqs[p.idA], seqB) +
                                (p.colIdxB < this.cols.length - 1 ? this.calculatePairScore(p.idB, this.cols[p.colIdxB + 1], seqB, currentSeqs[this.cols[p.colIdxB + 1]]) : 0);

                            const newScore = this.calculateColumnStability(p.idB, newSeqB) +
                                this.calculatePairScore(p.idA, p.idB, currentSeqs[p.idA], newSeqB) +
                                (p.colIdxB < this.cols.length - 1 ? this.calculatePairScore(p.idB, this.cols[p.colIdxB + 1], newSeqB, currentSeqs[this.cols[p.colIdxB + 1]]) : 0);

                            if (newScore > oldScore) {
                                currentSeqs[p.idB] = newSeqB;
                                improvements++;
                                improved = true;
                                break;
                            }
                        }
                    }
                }

                if (improved) break;
            }

            if (!improved) {
                this.onLog(`[TargetedRepair] 第 ${round + 1} 轮: 无法兑现剩余潜力。`);
                break;
            }
        }

        const finalScore = this.calculateGlobalScore(currentSeqs);
        this.onLog(`[TargetedRepair] 完成。共 ${improvements} 次改进。分数: ${Math.floor(finalScore)}`);
        return { seqs: currentSeqs, score: finalScore };
    }

    // [NEW] 局部优化：只接受更优解的 Hill Climbing
    localRefine(seqs, maxSeconds = 5) {
        this.onLog(`[Refine] 开始局部优化 (${maxSeconds}秒)...`);
        const startTime = performance.now();
        let currentSeqs = JSON.parse(JSON.stringify(seqs));
        let currentScore = this.calculateGlobalScore(currentSeqs);
        let bestSeqs = JSON.parse(JSON.stringify(currentSeqs));
        let bestScore = currentScore;
        let improvements = 0;

        // 迭代优化每一列
        let round = 0;
        while (performance.now() - startTime < maxSeconds * 1000) {
            round++;
            let anyImproved = false;

            for (let c = 0; c < this.cols.length; c++) {
                if (performance.now() - startTime > maxSeconds * 1000) break;

                const colId = this.cols[c];
                const seq = currentSeqs[colId];
                if (!seq || seq.length < 2) continue;

                // 尝试所有相邻交换
                for (let i = 0; i < seq.length - 1; i++) {
                    // Swap i and i+1
                    [seq[i], seq[i + 1]] = [seq[i + 1], seq[i]];

                    // 快速评估局部变化
                    let newLocalScore = this.calculateColumnStability(colId, seq);
                    if (c > 0) {
                        newLocalScore += this.calculatePairScore(
                            this.cols[c - 1], colId,
                            currentSeqs[this.cols[c - 1]], seq
                        );
                    }
                    if (c < this.cols.length - 1) {
                        newLocalScore += this.calculatePairScore(
                            colId, this.cols[c + 1],
                            seq, currentSeqs[this.cols[c + 1]]
                        );
                    }

                    // 计算旧的局部分数
                    const oldSeq = [...seq];
                    [oldSeq[i], oldSeq[i + 1]] = [oldSeq[i + 1], oldSeq[i]]; // Revert
                    let oldLocalScore = this.calculateColumnStability(colId, oldSeq);
                    if (c > 0) {
                        oldLocalScore += this.calculatePairScore(
                            this.cols[c - 1], colId,
                            currentSeqs[this.cols[c - 1]], oldSeq
                        );
                    }
                    if (c < this.cols.length - 1) {
                        oldLocalScore += this.calculatePairScore(
                            colId, this.cols[c + 1],
                            oldSeq, currentSeqs[this.cols[c + 1]]
                        );
                    }

                    if (newLocalScore > oldLocalScore) {
                        // 保持交换（已经交换了）
                        improvements++;
                        anyImproved = true;
                        // 更新缓存
                        this.stabilityScores[colId] = this.calculateColumnStability(colId, seq);
                        if (c > 0) this.pairScores[c - 1] = this.calculatePairScore(this.cols[c - 1], colId, currentSeqs[this.cols[c - 1]], seq);
                        if (c < this.cols.length - 1) this.pairScores[c] = this.calculatePairScore(colId, this.cols[c + 1], seq, currentSeqs[this.cols[c + 1]]);
                    } else {
                        // 恢复交换
                        [seq[i], seq[i + 1]] = [seq[i + 1], seq[i]];
                    }
                }
            }

            // 更新全局最优
            const fullScore = this.calculateGlobalScore(currentSeqs);
            if (fullScore > bestScore) {
                bestScore = fullScore;
                bestSeqs = JSON.parse(JSON.stringify(currentSeqs));
            }

            // 如果没有改进，提前退出
            if (!anyImproved) {
                this.onLog(`[Refine] 第 ${round} 轮无改进，提前结束。`);
                break;
            }
        }

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        this.onLog(`[Refine] 完成。共 ${round} 轮，${improvements} 次改进。耗时 ${elapsed}s。Score: ${Math.floor(bestScore)}`);
        return { seqs: bestSeqs, score: bestScore };
    }

    // [Core Optimization] 计算单列稳定性 (Integer Optimized)
    calculateColumnStability(id, seq) {
        let penalty = 0;
        const cutoffs = this.cutoffYears;
        const count = cutoffs.length;
        const setMap = this.activeSets[id];
        const weight = this.weights.stability;

        // Optimization: Use Map<Int, Int> for positions
        let prevPosMap = null;

        const y0 = cutoffs[0];
        const set0 = setMap[y0]; // Set<Int>

        if (set0 && set0.size > 0) {
            prevPosMap = new Map();
            for (let k = 0; k < seq.length; k++) {
                if (set0.has(seq[k])) prevPosMap.set(seq[k], k);
            }
        }

        for (let i = 1; i < count; i++) {
            const y = cutoffs[i];
            const currSet = setMap[y];
            if (!currSet) continue;

            // Re-use map object if implementation allows? No, native Map clear is fast enough?
            // Just create new map for simplicity and GC handling
            const currPosMap = new Map();
            let hasActive = false;

            for (let k = 0; k < seq.length; k++) {
                if (currSet.has(seq[k])) {
                    currPosMap.set(seq[k], k);
                    hasActive = true;
                }
            }

            if (!prevPosMap || prevPosMap.size === 0) {
                if (hasActive) prevPosMap = currPosMap;
                continue;
            }
            if (!hasActive) continue;

            // Calculate Shift Penalty
            for (const [id, currIdx] of currPosMap) {
                const prevIdx = prevPosMap.get(id);
                if (prevIdx !== undefined) {
                    const shift = Math.abs(currIdx - prevIdx);
                    if (shift > 0) penalty += shift * weight;
                }
            }
            prevPosMap = currPosMap;
        }
        return -penalty;
    }

    // [Core Optimization] 计算两列得分 (Matrix + Integer Optimized)
    // [Core Optimization] 计算两列得分 (Restored Interval Loop Logic for Correctness)
    calculatePairScore(idA, idB, seqA, seqB, colIdx) {
        let score = 0;
        const wCont = this.weights.continuity;
        const wGap = this.weights.gap;
        const wAdj = this.weights.adjacency;

        const cutoffs = this.cutoffYears;
        const count = cutoffs.length;

        // Map Loopup for Indices O(N)
        const mapA = new Map();
        const lenA = seqA.length;
        for (let k = 0; k < lenA; k++) mapA.set(seqA[k], k);

        const mapB = new Map();
        const lenB = seqB.length;
        for (let k = 0; k < lenB; k++) mapB.set(seqB[k], k);

        for (let i = 0; i < count; i++) {
            const y = cutoffs[i];
            const nextY = (i < count - 1) ? cutoffs[i + 1] : CONFIG.MAX_YEAR;
            const duration = nextY - y;

            const setA = this.activeSets[idA][y];
            const setB = this.activeSets[idB][y];
            if (!setA || !setB) continue;

            // Find Intersection
            const shared = [];
            setA.forEach(rA => {
                if (setB.has(rA)) {
                    shared.push(rA);
                } else {
                    // Check Fuzzy
                    const rootA = this.fuzzyRoots[rA];
                    for (const rB of setB) {
                        if (this.fuzzyRoots[rB] === rootA) {
                            shared.push(rA);
                            break;
                        }
                    }
                }
            });

            if (shared.length === 0) continue;

            score += shared.length * duration * wCont;

            if (wGap > 0 || wAdj > 0) {
                let totalGap = 0;
                let adjacencies = 0;

                for (const r of shared) {
                    let idxA = mapA.get(r);
                    let idxB = mapB.get(r);
                    if (idxB === undefined) {
                        // Fuzzy lookup in B
                        const rootA = this.fuzzyRoots[r];
                        for (let k = 0; k < lenB; k++) {
                            if (this.fuzzyRoots[seqB[k]] === rootA) {
                                idxB = k;
                                break;
                            }
                        }
                    }

                    if (idxA !== undefined && idxB !== undefined) {
                        let distA = 0;
                        // Scan Active Blockers in A
                        for (let k = idxA + 1; k < lenA; k++) {
                            const neighbor = seqA[k];
                            if (setA.has(neighbor)) {
                                distA++;
                            } else {
                                // Fuzzy Active Check
                                const rootN = this.fuzzyRoots[neighbor];
                                for (const act of setA) {
                                    if (this.fuzzyRoots[act] === rootN) {
                                        distA++; break;
                                    }
                                }
                            }
                        }

                        let distB = 0;
                        // Scan Active Blockers in B
                        for (let k = 0; k < idxB; k++) {
                            const neighbor = seqB[k];
                            if (setB.has(neighbor)) {
                                distB++;
                            } else {
                                // Fuzzy Active Check
                                const rootN = this.fuzzyRoots[neighbor];
                                for (const act of setB) {
                                    if (this.fuzzyRoots[act] === rootN) {
                                        distB++; break;
                                    }
                                }
                            }
                        }

                        const gap = distA + distB;
                        totalGap += gap;
                        if (gap === 0) adjacencies++;
                    }
                }
                score -= totalGap * duration * wGap;
                score += adjacencies * duration * wAdj;
            }
        }
        return score;
    }

    // 初始化或全量计算全局分数 (Integer Optimized)
    calculateGlobalScore(currentSeqs) {
        let totalScore = 0;
        this.pairScores = {};
        this.stabilityScores = {};

        // 1. Column Stability
        for (let c = 0; c < this.cols.length; c++) {
            const id = this.cols[c];
            const s = this.calculateColumnStability(id, currentSeqs[id]);
            this.stabilityScores[id] = s;
            totalScore += s;
        }

        // 2. Pair Scores
        for (let c = 0; c < this.cols.length - 1; c++) {
            const idA = this.cols[c];
            const idB = this.cols[c + 1];
            // Pass ColIdx 'c' for cache
            const s = this.calculatePairScore(idA, idB, currentSeqs[idA], currentSeqs[idB], c);
            this.pairScores[c] = s;
            totalScore += s;
        }
        return totalScore;
    }

    // [Optimization] 增量计算分数变化 (Integer Optimized + Object Return)
    calculateScoreDeltaWithSwap(currentSeqs, colIdx, idx1, idx2) {
        const colId = this.cols[colIdx];
        const seq = currentSeqs[colId];

        // 1. 确定受影响的邻居对
        const leftPairIdx = colIdx - 1;
        const rightPairIdx = colIdx;

        // 2. 获取旧分数
        let oldScorePart = 0;
        if (leftPairIdx >= 0) oldScorePart += this.pairScores[leftPairIdx];
        if (rightPairIdx < this.cols.length - 1) oldScorePart += this.pairScores[rightPairIdx];
        oldScorePart += (this.stabilityScores[colId] || 0);

        // 3. 模拟交换
        const temp = seq[idx1];
        seq[idx1] = seq[idx2];
        seq[idx2] = temp;

        // 4. 计算新分数
        let newLeftScore = 0;
        let newRightScore = 0;

        if (leftPairIdx >= 0) {
            const idLeft = this.cols[leftPairIdx];
            // Pass leftPairIdx
            newLeftScore = this.calculatePairScore(idLeft, colId, currentSeqs[idLeft], seq, leftPairIdx);
        }
        if (rightPairIdx < this.cols.length - 1) {
            const idRight = this.cols[rightPairIdx + 1];
            // Pass rightPairIdx (which is colIdx)
            newRightScore = this.calculatePairScore(colId, idRight, seq, currentSeqs[idRight], rightPairIdx);
        }

        // New Stability Score
        const newStability = this.calculateColumnStability(colId, seq);

        // 5. 恢复交换
        seq[idx2] = seq[idx1];
        seq[idx1] = temp;

        // 返回 Delta 和新的局部缓存，以便接受时更新
        return {
            delta: (newLeftScore + newRightScore + newStability) - oldScorePart,
            newLeftScore,
            newRightScore,
            newStability,
            leftPairIdx,
            rightPairIdx
        };
    }


    async run(iterations = 500000, updateCallback, stopRef, existingMasterSeqs = null) {
        this.init(existingMasterSeqs);
        this.onLog("=== SeqOpt v2.2: 潜力导向优化 ===");

        // === Strategy 1: 使用继承的布局（如果存在且有效） ===
        let inheritedSeqs = null;
        let inheritedScore = -Infinity;

        // [Debug] 检查传入的 existingMasterSeqs
        this.onLog(`[Debug] existingMasterSeqs: ${existingMasterSeqs ? Object.keys(existingMasterSeqs).length + '列' : 'NULL'}`);

        if (existingMasterSeqs && Object.keys(existingMasterSeqs).length > 0) {
            inheritedSeqs = JSON.parse(JSON.stringify(this.masterSeqs));
            inheritedScore = this.calculateGlobalScore(inheritedSeqs);
            this.onLog(`[Start] 继承现有布局作为起点 (Score: ${Math.floor(inheritedScore)})`);
        }

        // === Strategy 2: 总是尝试贪心构造一次，看是否更优 ===
        // 但如果继承的分数很高，贪心可能反而破坏它。
        // 我们可以两者比较，取优者。
        let bestSeqs, bestScore;

        if (inheritedSeqs) {
            bestSeqs = inheritedSeqs;
            bestScore = inheritedScore;
        } else {
            const greedSeqs = this.greedyConstruct();
            const greedScore = this.calculateGlobalScore(greedSeqs);
            this.onLog(`[Start] 贪心构造初始解 (Score: ${Math.floor(greedScore)})`);
            bestSeqs = greedSeqs;
            bestScore = greedScore;
        }

        let currentSeqs = JSON.parse(JSON.stringify(bestSeqs));
        let currentScore = bestScore;

        // === Phase 1: Targeted Repair (Before SA) ===
        // 尝试修复一些明显的结构问题
        if (!stopRef.current) {
            const repairRes = this.targetedRepair(currentSeqs);
            if (repairRes.score > currentScore) {
                currentSeqs = repairRes.seqs;
                currentScore = repairRes.score;
                bestSeqs = JSON.parse(JSON.stringify(currentSeqs));
                bestScore = currentScore;
            }
        }

        // SA Params
        let temp = 20.0;
        const cooling = 0.9995;
        const n = this.cols.length;
        let lastImprovement = 0;

        // Performance Control
        let lastYieldTime = performance.now();
        let lastUIUpdateTime = performance.now();

        // [New] 恢复检查点系统 - 用于 C/D 策略的渐进式恢复检测
        let recoveryCheckpoint = null; // { triggerIter, bestScoreAtTrigger }

        // === SA Loop ===
        this.onLog(`[Worker] Starting SA Loop for ${iterations} iters...`);
        for (let i = 0; i < iterations; i++) {
            if (stopRef.current) break;

            // --- Move Type Selection ---
            const moveType = Math.random();

            // 1. Column-Internal Swap (70%)
            if (moveType < 0.7) {
                const colIdx = Math.floor(Math.random() * n);
                const colId = this.cols[colIdx];
                const seq = currentSeqs[colId];
                const len = seq.length;
                if (len < 2) continue;

                // Prefer swapping adjacent or close items (Bubble-ish)
                const idx1 = Math.floor(Math.random() * len);
                let idx2 = idx1 + 1; // Default adjacent
                if (Math.random() < 0.3 || idx2 >= len) {
                    // 30% Random long jump
                    idx2 = Math.floor(Math.random() * len);
                }
                if (idx1 === idx2) continue;

                // Use Delta Calculation (Highly Optimized)
                const res = this.calculateScoreDeltaWithSwap(currentSeqs, colIdx, idx1, idx2);
                const delta = res.delta;

                if (delta > 0 || Math.random() < Math.exp(delta / temp)) {
                    // Accept (Perform Swap)
                    const t = seq[idx1];
                    seq[idx1] = seq[idx2];
                    seq[idx2] = t;

                    // Update Caches
                    currentScore += delta;
                    this.stabilityScores[colId] = res.newStability;
                    if (res.leftPairIdx >= 0) this.pairScores[res.leftPairIdx] = res.newLeftScore;
                    if (res.rightPairIdx < n - 1) this.pairScores[res.rightPairIdx] = res.newRightScore;

                    if (currentScore > bestScore) {
                        bestScore = currentScore;
                        bestSeqs = JSON.parse(JSON.stringify(currentSeqs));
                        lastImprovement = i;
                    }
                }
            }
            // 2. Multi-Column Coordinated Swap (15%) - 跨列协同交换
            else if (moveType < 0.85) {
                // 在多个相邻列中同时交换同一对政权
                // 这解决了"单列交换无法改善全局"的问题
                const startCol = Math.floor(Math.random() * (n - 1));
                const numCols = 2 + Math.floor(Math.random() * Math.min(3, n - startCol)); // 2-4 列

                // 找到这些列中共有的政权对
                const firstColId = this.cols[startCol];
                const firstSeq = currentSeqs[firstColId];
                if (firstSeq.length < 2) continue;

                // 随机选择两个政权
                const r1Idx = Math.floor(Math.random() * firstSeq.length);
                let r2Idx = Math.floor(Math.random() * firstSeq.length);
                if (r1Idx === r2Idx) continue;

                const r1 = firstSeq[r1Idx];
                const r2 = firstSeq[r2Idx];

                // 检查这两个政权是否都存在于后续列中
                const colsToSwap = [startCol];
                for (let c = startCol + 1; c < Math.min(startCol + numCols, n); c++) {
                    const colId = this.cols[c];
                    const seq = currentSeqs[colId];
                    if (seq.includes(r1) && seq.includes(r2)) {
                        colsToSwap.push(c);
                    } else {
                        break; // 必须连续
                    }
                }

                if (colsToSwap.length < 2) continue; // 至少需要 2 列

                // Backup
                const backupPairScores = { ...this.pairScores };
                const backupStabilityScores = { ...this.stabilityScores };

                // 执行协同交换
                for (const c of colsToSwap) {
                    const colId = this.cols[c];
                    const seq = currentSeqs[colId];
                    const idx1 = seq.indexOf(r1);
                    const idx2 = seq.indexOf(r2);
                    if (idx1 !== -1 && idx2 !== -1) {
                        [seq[idx1], seq[idx2]] = [seq[idx2], seq[idx1]];
                    }
                }

                // 计算新分数
                const newGlobal = this.calculateGlobalScore(currentSeqs);
                const delta = newGlobal - currentScore;

                if (delta > 0 || Math.random() < Math.exp(delta / temp)) {
                    currentScore = newGlobal;
                    if (currentScore > bestScore) {
                        bestScore = currentScore;
                        bestSeqs = JSON.parse(JSON.stringify(currentSeqs));
                        lastImprovement = i;
                        // this.onLog(`[CoordSwap] +${Math.floor(delta)} at iter ${i} (${colsToSwap.length} cols)`);
                    }
                } else {
                    // Revert all swaps
                    for (const c of colsToSwap) {
                        const colId = this.cols[c];
                        const seq = currentSeqs[colId];
                        const idx1 = seq.indexOf(r1);
                        const idx2 = seq.indexOf(r2);
                        if (idx1 !== -1 && idx2 !== -1) {
                            [seq[idx1], seq[idx2]] = [seq[idx2], seq[idx1]];
                        }
                    }
                    this.pairScores = backupPairScores;
                    this.stabilityScores = backupStabilityScores;
                }
            }
            // 3. Block Move (15%) - 模拟把一坨政权整体移走
            else {
                const colIdx = Math.floor(Math.random() * n);
                const colId = this.cols[colIdx];
                const seq = currentSeqs[colId];
                const len = seq.length;
                if (len < 3) continue;

                const blockSize = 1 + Math.floor(Math.random() * 3); // 1-3 items
                const start = Math.floor(Math.random() * (len - blockSize));
                const target = Math.floor(Math.random() * (len - blockSize)); // allow insert anywhere
                if (Math.abs(start - target) < 1) continue;

                // [Fix] Backup Cache because calculateGlobalScore mutates it
                const backupPairScores = { ...this.pairScores };
                const backupStabilityScores = { ...this.stabilityScores };

                // Do full calculation for block move (complex to incrementalize)
                const block = seq.splice(start, blockSize);
                seq.splice(target, 0, ...block);
                // Recalc local
                const newGlobal = this.calculateGlobalScore(currentSeqs); // Side-effect: updates cache to NEW state
                const delta = newGlobal - currentScore;

                if (delta > 0 || Math.random() < Math.exp(delta / temp)) {
                    currentScore = newGlobal;
                    if (currentScore > bestScore) {
                        bestScore = currentScore;
                        bestSeqs = JSON.parse(JSON.stringify(currentSeqs));
                        lastImprovement = i;
                    }
                } else {
                    // Revert
                    seq.splice(target, blockSize);
                    seq.splice(start, 0, ...block);

                    // [Fix] Restore Cache to match reverted state
                    this.pairScores = backupPairScores;
                    this.stabilityScores = backupStabilityScores;
                }
            }

            // --- Annealing ---
            if (i % 500 === 0) temp = Math.max(0.1, temp * cooling);

            // --- Reheating / Ripple Repair (If stuck) ---
            // [Tuned] 降低触发门槛：从50000降到20000，更积极地打破局部最优
            if (i - lastImprovement > 20000 && i % 5000 === 0) {
                const stuckDuration = i - lastImprovement;
                const strategy = Math.random();
                this.onLog(`[Stuck] ${stuckDuration} iters without improvement. Triggering escape strategy...`);

                // [Redesigned] 权重重新分配: A=35%, B=25%, C=20%, D=20% (移除了E策略)
                if (strategy < 0.35) {
                    // Strategy A: Targeted Repair (定向修复) - 35%
                    this.onLog(`[Strategy A] Targeted Repair...`);
                    const repairRes = this.targetedRepair(currentSeqs, 10);
                    if (repairRes.score > currentScore) {
                        currentSeqs = repairRes.seqs;
                        currentScore = repairRes.score;
                        this.onLog(`[Strategy A] Repair improved score to ${Math.floor(currentScore)}`);
                        if (currentScore > bestScore) {
                            bestScore = currentScore;
                            bestSeqs = JSON.parse(JSON.stringify(currentSeqs));
                            lastImprovement = i;
                        }
                    } else {
                        this.onLog(`[Strategy A] Repair did not improve.`);
                    }
                } else if (strategy < 0.6) {
                    // Strategy B: Random Reheat (温度重置) - 25%
                    temp = stuckDuration > 50000 ? 10.0 : 5.0;
                    this.onLog(`[Strategy B] Reheat. Temp reset to ${temp.toFixed(1)}`);
                } else if (strategy < 0.8) {
                    // Strategy C: Column Shuffle (列内随机打乱) - 20%
                    // [Redesigned] 渐进式恢复保护
                    const colIdx = Math.floor(Math.random() * n);
                    const colId = this.cols[colIdx];
                    const seq = currentSeqs[colId];
                    if (seq.length > 3) {
                        const oldSeq = [...seq]; // 备份
                        const oldScore = currentScore;

                        const shuffleStart = Math.floor(seq.length * 0.15);
                        const shuffleEnd = Math.floor(seq.length * 0.85);
                        for (let k = shuffleEnd - 1; k > shuffleStart; k--) {
                            const j = shuffleStart + Math.floor(Math.random() * (k - shuffleStart + 1));
                            [seq[k], seq[j]] = [seq[j], seq[k]];
                        }
                        const newScore = this.calculateGlobalScore(currentSeqs);

                        // 规则1：分数下降超过30%，立即Jump to Best
                        if (newScore < bestScore * 0.7) {
                            currentSeqs[colId] = oldSeq; // 先回滚
                            currentSeqs = JSON.parse(JSON.stringify(bestSeqs));
                            currentScore = bestScore;
                            temp = 5.0;
                            this.onLog(`[Strategy C] Score drop >30% (${Math.floor(newScore)} vs best ${Math.floor(bestScore)}). Jump to Best.`);
                        }
                        // 规则2：分数下降但未超过30%，进入渐进式恢复观察期
                        else if (newScore < oldScore) {
                            currentScore = newScore;
                            recoveryCheckpoint = { triggerIter: i, bestScoreAtTrigger: bestScore };
                            this.onLog(`[Strategy C] Shuffle on ${colId}. Score: ${Math.floor(oldScore)} -> ${Math.floor(newScore)}. Entering recovery mode.`);
                        } else {
                            currentScore = newScore;
                            this.onLog(`[Strategy C] Shuffle on ${colId}. Score: ${Math.floor(oldScore)} -> ${Math.floor(newScore)}`);
                        }
                    }
                } else {
                    // Strategy D: Multi-Column Swap (跨列块交换) - 20%
                    // [Redesigned] 渐进式恢复保护
                    const col1 = Math.floor(Math.random() * n);
                    const col2 = Math.floor(Math.random() * n);
                    if (col1 !== col2) {
                        const id1 = this.cols[col1];
                        const id2 = this.cols[col2];
                        const seq1 = currentSeqs[id1];
                        const seq2 = currentSeqs[id2];
                        const common = seq1.filter(r => seq2.includes(r));
                        if (common.length >= 2) {
                            const r1 = common[Math.floor(Math.random() * common.length)];
                            const r2 = common[Math.floor(Math.random() * common.length)];
                            if (r1 !== r2) {
                                const oldScore = currentScore;
                                const idx1 = seq1.indexOf(r1);
                                const idx2 = seq1.indexOf(r2);
                                [seq1[idx1], seq1[idx2]] = [seq1[idx2], seq1[idx1]];
                                const newScore = this.calculateGlobalScore(currentSeqs);

                                // 规则1：分数下降超过30%，立即Jump to Best
                                if (newScore < bestScore * 0.7) {
                                    [seq1[idx1], seq1[idx2]] = [seq1[idx2], seq1[idx1]]; // 回滚
                                    currentSeqs = JSON.parse(JSON.stringify(bestSeqs));
                                    currentScore = bestScore;
                                    temp = 5.0;
                                    this.onLog(`[Strategy D] Score drop >30%. Jump to Best.`);
                                }
                                // 规则2：分数下降但未超过30%，进入渐进式恢复观察期
                                else if (newScore < oldScore) {
                                    currentScore = newScore;
                                    recoveryCheckpoint = { triggerIter: i, bestScoreAtTrigger: bestScore };
                                    this.onLog(`[Strategy D] Swap in ${id1}. Score: ${Math.floor(oldScore)} -> ${Math.floor(newScore)}. Entering recovery mode.`);
                                } else {
                                    currentScore = newScore;
                                    this.onLog(`[Strategy D] Swap in ${id1}. Score: ${Math.floor(oldScore)} -> ${Math.floor(newScore)}`);
                                }
                            }
                        }
                    }
                }
            }

            // --- [New] 渐进式恢复检查 ---
            if (recoveryCheckpoint) {
                const elapsed = i - recoveryCheckpoint.triggerIter;
                const targetBest = recoveryCheckpoint.bestScoreAtTrigger;

                // 检查是否已恢复到最佳分数
                if (currentScore >= targetBest) {
                    this.onLog(`[Recovery] Fully recovered to ${Math.floor(currentScore)}. Exiting recovery mode.`);
                    recoveryCheckpoint = null;
                }
                // 规则2a: 10000次后仍未达到90%
                else if (elapsed >= 10000 && currentScore < targetBest * 0.9) {
                    currentSeqs = JSON.parse(JSON.stringify(bestSeqs));
                    currentScore = bestScore;
                    temp = 5.0;
                    recoveryCheckpoint = null;
                    this.onLog(`[Recovery] 10k iters, still <90% of best (${Math.floor(currentScore)} < ${Math.floor(targetBest * 0.9)}). Jump to Best.`);
                }
                // 规则2b: 20000次后仍未达到95%
                else if (elapsed >= 20000 && currentScore < targetBest * 0.95) {
                    currentSeqs = JSON.parse(JSON.stringify(bestSeqs));
                    currentScore = bestScore;
                    temp = 5.0;
                    recoveryCheckpoint = null;
                    this.onLog(`[Recovery] 20k iters, still <95% of best. Jump to Best.`);
                }
                // 规则2c: 30000次后仍未达到100%
                else if (elapsed >= 30000 && currentScore < targetBest) {
                    currentSeqs = JSON.parse(JSON.stringify(bestSeqs));
                    currentScore = bestScore;
                    temp = 5.0;
                    recoveryCheckpoint = null;
                    this.onLog(`[Recovery] 30k iters, still <100% of best. Jump to Best.`);
                }
            }

            // --- UI Yielding ---
            if (i % 2000 === 0) {
                const now = performance.now();
                if (now - lastYieldTime > 12) {
                    if (now - lastUIUpdateTime > 500) {
                        if (updateCallback) {
                            const layout = this.generateLayout(bestSeqs);
                            updateCallback(layout, bestScore, i);
                        }
                        lastUIUpdateTime = now;
                        await new Promise(r => setTimeout(r, 0));
                    } else {
                        await new Promise(r => setTimeout(r, 0));
                    }
                    lastYieldTime = performance.now();
                }
            }
        } // End Loop

        // === Final Step: Local Refinement ===
        this.onLog("=== 最终阶段：局部精修 (Final Refine) ===");
        const finalRes = this.localRefine(bestSeqs, 3); // 3 seconds max
        if (finalRes.score > bestScore) {
            bestSeqs = finalRes.seqs;
            bestScore = finalRes.score;
        }

        this.masterSeqs = bestSeqs;
        return {
            layout: this.generateLayout(bestSeqs),
            score: bestScore
        };
    }


    // 根据 Master Sequence 填充 Grid 坐标
    // Generate Final Layout (Convert Ints back to Strings)
    generateLayout(inputSeqs) {
        const source = inputSeqs || this.masterSeqs;

        if (!source || Object.keys(source).length === 0) {
            if (this.onLog) this.onLog(`[Warning] generateLayout received EMPTY seqs!`);
            return {};
        }

        const result = {};
        this.cols.forEach(id => {
            const seq = source[id];
            if (seq) {
                // Map Int -> String
                result[id] = seq.map(intId => {
                    const s = this.intToStr[intId];
                    return s === undefined ? "UNKNOWN" : s;
                });
            } else {
                result[id] = [];
            }
        });
        return result;
    }
}

let shouldStop = false;
// 模拟 React ref 对象，让算法类可以读取 stopRef.current
const stopRef = { get current() { return shouldStop; } };

// [Fix] Ensure grid uses Sets (postMessage might degrade Sets to Arrays or Objects)
const hydrateGrid = (grid) => {
    if (!grid) return null;
    Object.keys(grid).forEach(r => {
        if (grid[r]) {
            Object.keys(grid[r]).forEach(y => {
                const item = grid[r][y];
                if (Array.isArray(item)) {
                    grid[r][y] = new Set(item);
                }
                // If it's seemingly an empty object but should be a Set?
                // This happens if Set is serialized poorly. 
                // But generally Array.from(Set) on main thread is best.
            });
        }
    });
    return grid;
};

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    // === 1. STOP 信号 ===
    if (type === 'STOP') {
        shouldStop = true;
        self.postMessage({ type: 'LOG', msg: 'Worker: Received STOP signal.' });
        return;
    }

    // === 2. 快速评分 (Quick Score) ===
    if (type === 'QUICK_SCORE') {
        const { grid, colOrder, masterSeqs } = payload;
        // [Fix] Hydrate grid
        hydrateGrid(grid);
        try {
            // TSP Score
            const sorter = new AdvancedColumnSorter(colOrder, grid, {}, () => { });
            await sorter.precompute();
            const pathIds = colOrder.map((_, i) => i);
            const tspScore = sorter.getPathScore(pathIds);

            // Lay Score
            let layScore = 0;
            if (masterSeqs) {
                const optimizer = new GlobalSequenceOptimizer(colOrder, grid, () => { });
                optimizer.init(masterSeqs);
                // [Fix] Use internal Integer sequences (optimizer.masterSeqs) for calculation
                layScore = optimizer.calculateGlobalScore(optimizer.masterSeqs);
            }

            self.postMessage({
                type: 'QUICK_SCORE_RESULT',
                tspScore: Math.floor(tspScore),
                layScore: Math.floor(layScore)
            });
        } catch (err) {
            console.error(err);
        }
        return;
    }

    // === 3. 仅 TSP 排序 (TSP Only) ===
    if (type === 'START_TSP_ONLY') {
        shouldStop = false;
        const { data, colOrder, iterations } = payload;
        hydrateGrid(data.grid); // [Fix]
        const log = (msg) => self.postMessage({ type: 'LOG', msg });

        try {
            log("=== 🚀 Worker: 启动独立 TSP 排序 ===");
            const colSorter = new AdvancedColumnSorter(data.regions, data.grid, data.names, log);
            await colSorter.precompute();

            const tspCallback = (path, score) => {
                self.postMessage({ type: 'PROGRESS_TSP', score });
            };

            const colResult = await colSorter.run(
                iterations.tsp || 50000000,
                tspCallback,
                stopRef,
                colOrder
            );

            if (shouldStop) { log("优化已中止"); return; }
            log(`列排序完成。Score: ${colResult.score}`);

            self.postMessage({ type: 'RESULT_TSP', colOrder: colResult.path, score: colResult.score });
            self.postMessage({ type: 'WORKER_DONE' });

        } catch (err) {
            self.postMessage({ type: 'ERROR', msg: err.message });
            console.error(err);
        }
        return;
    }

    // === 4. 仅 Layout 布局 (Layout Only) ===
    if (type === 'START_LAY_ONLY') {
        shouldStop = false;
        const { data, colOrder, masterSeqs, iterations } = payload;
        hydrateGrid(data.grid); // [Fix]
        const log = (msg) => self.postMessage({ type: 'LOG', msg });

        try {
            log("=== 🚀 Worker: 启动独立 Layout 优化 ===");
            const cellSorter = new GlobalSequenceOptimizer(colOrder, data.grid, log);

            const layCallback = (layout, score, iter) => {
                self.postMessage({ type: 'PROGRESS_LAY', layout, score, iter });
            };

            const cellResult = await cellSorter.run(
                iterations.lay || 500000,
                layCallback,
                stopRef,
                masterSeqs
            );

            if (shouldStop) { log("优化已中止"); return; }
            log(`布局优化完成。Score: ${Math.floor(cellResult.score)}`);

            self.postMessage({
                type: 'RESULT_LAY_DONE',
                masterSeqs: cellSorter.masterSeqs,
                layout: cellResult.layout,
                score: Math.floor(cellResult.score)
            });

        } catch (err) {
            self.postMessage({ type: 'ERROR', msg: err.message });
            console.error(err);
        }
        return;
    }

    // === 5. 启动深度优化 (Deep Optimization) ===
    if (type === 'START_DEEP_OPT') {
        shouldStop = false;
        const { data, colOrder, masterSeqs, tspBestScore, iterations } = payload;
        hydrateGrid(data.grid); // [Fix]

        const log = (msg) => self.postMessage({ type: 'LOG', msg });

        try {
            log("=== 🚀 Worker: 启动深度联合优化 ===");

            // --- Phase 1: Column Sort (TSP) ---
            log(`[Phase 1] 列排序 (TSP)`);
            const colSorter = new AdvancedColumnSorter(data.regions, data.grid, data.names, log);
            await colSorter.precompute();

            const tspCallback = (path, score) => {
                // TSP 阶段只传回 score
                self.postMessage({ type: 'PROGRESS_TSP', score });
            };

            // 运行 TSP
            const colResult = await colSorter.run(
                iterations.tsp || 50000000,
                tspCallback,
                stopRef,
                colOrder
            );

            if (shouldStop) { log("优化已中止"); return; }

            const newColOrder = colResult.path;
            const finalTspScore = colResult.score;
            log(`列排序完成。Score: ${finalTspScore}`);

            // 通知主线程更新列顺序
            self.postMessage({ type: 'RESULT_TSP', colOrder: newColOrder, score: finalTspScore });


            // --- Phase 2: Cell Layout (Sequence) ---
            log(`[Phase 2] 单元格序列对齐`);
            const cellSorter = new GlobalSequenceOptimizer(newColOrder, data.grid, log);

            // 运行 LAY
            const layCallback = (layout, score, iter) => {
                self.postMessage({ type: 'PROGRESS_LAY', layout, score, iter });
            };

            const cellResult = await cellSorter.run(
                iterations.lay || 500000,
                layCallback,
                stopRef,
                masterSeqs // 传入现有 masterSeqs 作为继承起点
            );

            if (shouldStop) { log("优化已中止"); return; }

            log(`深度优化完成。Final TSP: ${finalTspScore}, Final LAY: ${Math.floor(cellResult.score)}`);

            self.postMessage({
                type: 'RESULT_FINAL',
                colOrder: newColOrder,
                masterSeqs: cellSorter.masterSeqs,
                layout: cellResult.layout,
                score: Math.floor(cellResult.score),
                tspScore: finalTspScore
            });

        } catch (err) {
            self.postMessage({ type: 'ERROR', msg: err.message });
            console.error(err);
        }
    }
};
console.log("Worker v101 Loaded");
