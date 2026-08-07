const MISSING = Symbol('worldbook-merge-missing');

const cloneValue = (value) => {
    if (value === MISSING || value === undefined || value === null) return value;
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {}
    }
    return JSON.parse(JSON.stringify(value));
};

const isPlainObject = value => Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
);

const deepEqual = (left, right) => {
    if (left === right) return true;
    if (left === MISSING || right === MISSING) return false;
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
        return left.every((item, index) => deepEqual(item, right[index]));
    }
    if (isPlainObject(left) || isPlainObject(right)) {
        if (!isPlainObject(left) || !isPlainObject(right)) return false;
        const leftKeys = Object.keys(left).sort();
        const rightKeys = Object.keys(right).sort();
        if (!deepEqual(leftKeys, rightKeys)) return false;
        return leftKeys.every(key => deepEqual(left[key], right[key]));
    }
    return false;
};

const publicConflictValue = value => (value === MISSING ? undefined : cloneValue(value));

const mergeValue = ({ base, local, latest, path, conflicts }) => {
    if (deepEqual(local, latest)) return cloneValue(local);
    if (deepEqual(local, base)) return cloneValue(latest);
    if (deepEqual(latest, base)) return cloneValue(local);

    if (isPlainObject(base) && isPlainObject(local) && isPlainObject(latest)) {
        const merged = {};
        const keys = Array.from(new Set([
            ...Object.keys(base),
            ...Object.keys(local),
            ...Object.keys(latest),
        ])).sort();
        keys.forEach((key) => {
            const next = mergeValue({
                base: Object.prototype.hasOwnProperty.call(base, key) ? base[key] : MISSING,
                local: Object.prototype.hasOwnProperty.call(local, key) ? local[key] : MISSING,
                latest: Object.prototype.hasOwnProperty.call(latest, key) ? latest[key] : MISSING,
                path: path ? `${path}.${key}` : key,
                conflicts,
            });
            if (next !== MISSING) merged[key] = next;
        });
        return merged;
    }

    conflicts.push({
        path,
        base: publicConflictValue(base),
        local: publicConflictValue(local),
        latest: publicConflictValue(latest),
    });
    return cloneValue(latest);
};

const entryIdentity = (entry, index) => {
    const id = String(entry?.id ?? '').trim();
    if (id) return id;
    if (entry?.uid !== null && entry?.uid !== undefined && String(entry.uid).trim()) {
        return `uid:${String(entry.uid).trim()}`;
    }
    return `index:${index}`;
};

const indexEntries = (entries = []) => {
    const list = Array.isArray(entries) ? entries : [];
    const order = [];
    const map = new Map();
    let duplicate = false;
    let unstable = false;
    list.forEach((entry, index) => {
        if (!String(entry?.id ?? '').trim() && (
            entry?.uid === null || entry?.uid === undefined || !String(entry.uid).trim()
        )) unstable = true;
        const id = entryIdentity(entry, index);
        if (map.has(id)) duplicate = true;
        order.push(id);
        map.set(id, entry);
    });
    return { list, order, map, duplicate, unstable };
};

const sameOrder = (left = [], right = []) => deepEqual(left, right);

const mergeEntries = ({ base, local, latest, conflicts }) => {
    const baseIndex = indexEntries(base);
    const localIndex = indexEntries(local);
    const latestIndex = indexEntries(latest);
    if (
        baseIndex.duplicate || localIndex.duplicate || latestIndex.duplicate ||
        baseIndex.unstable || localIndex.unstable || latestIndex.unstable
    ) {
        return mergeValue({ base, local, latest, path: 'entries', conflicts });
    }

    const ids = Array.from(new Set([
        ...baseIndex.order,
        ...localIndex.order,
        ...latestIndex.order,
    ]));
    const mergedById = new Map();
    ids.forEach((id) => {
        const merged = mergeValue({
            base: baseIndex.map.has(id) ? baseIndex.map.get(id) : MISSING,
            local: localIndex.map.has(id) ? localIndex.map.get(id) : MISSING,
            latest: latestIndex.map.has(id) ? latestIndex.map.get(id) : MISSING,
            path: `entries.${id}`,
            conflicts,
        });
        if (merged !== MISSING) mergedById.set(id, merged);
    });

    const baseForLocal = baseIndex.order.filter(id => localIndex.map.has(id));
    const baseForLatest = baseIndex.order.filter(id => latestIndex.map.has(id));
    const localBaseOrder = localIndex.order.filter(id => baseIndex.map.has(id));
    const latestBaseOrder = latestIndex.order.filter(id => baseIndex.map.has(id));
    const localReordered = !sameOrder(baseForLocal, localBaseOrder);
    const latestReordered = !sameOrder(baseForLatest, latestBaseOrder);
    let preferredOrder = latestIndex.order;
    if (localReordered && !latestReordered) preferredOrder = localIndex.order;
    if (localReordered && latestReordered && !sameOrder(localBaseOrder, latestBaseOrder)) {
        conflicts.push({
            path: 'entries.$order',
            base: baseIndex.order.slice(),
            local: localIndex.order.slice(),
            latest: latestIndex.order.slice(),
        });
    }
    const order = Array.from(new Set([
        ...preferredOrder,
        ...latestIndex.order,
        ...localIndex.order,
        ...baseIndex.order,
    ])).filter(id => mergedById.has(id));
    return order.map(id => mergedById.get(id));
};

export const mergeWorldbookChanges = ({ base = {}, local = {}, latest = {} } = {}) => {
    const conflicts = [];
    const baseObject = isPlainObject(base) ? base : {};
    const localObject = isPlainObject(local) ? local : {};
    const latestObject = isPlainObject(latest) ? latest : {};
    const merged = {};
    const keys = Array.from(new Set([
        ...Object.keys(baseObject),
        ...Object.keys(localObject),
        ...Object.keys(latestObject),
    ])).filter(key => key !== 'entries').sort();
    keys.forEach((key) => {
        const next = mergeValue({
            base: Object.prototype.hasOwnProperty.call(baseObject, key) ? baseObject[key] : MISSING,
            local: Object.prototype.hasOwnProperty.call(localObject, key) ? localObject[key] : MISSING,
            latest: Object.prototype.hasOwnProperty.call(latestObject, key) ? latestObject[key] : MISSING,
            path: key,
            conflicts,
        });
        if (next !== MISSING) merged[key] = next;
    });
    merged.entries = mergeEntries({
        base: baseObject.entries,
        local: localObject.entries,
        latest: latestObject.entries,
        conflicts,
    });
    return { merged, conflicts };
};

export const formatWorldbookConflictPath = (path = '') => {
    const value = String(path || '').trim();
    if (!value) return '未知字段';
    if (value === 'entries.$order') return '条目顺序';
    const match = value.match(/^entries\.([^\.]+)(?:\.(.+))?$/);
    if (!match) return value;
    return match[2] ? `条目 ${match[1]} / ${match[2]}` : `条目 ${match[1]}`;
};
