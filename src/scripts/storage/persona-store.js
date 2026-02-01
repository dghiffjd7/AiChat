
import { safeInvoke } from '../utils/tauri.js';
import { logger } from '../utils/logger.js';

const STORAGE_KEY = 'user_personas_v1';
const ACTIVE_KEY = 'user_personas_active_id_v1';

// Align with SillyTavern's persona_description_positions (subset)
export const persona_description_positions = {
    IN_PROMPT: 0,
    AT_DEPTH: 4,
    NONE: 9,
};

const DEFAULT_DEPTH = 2;
const DEFAULT_ROLE = 0; // 0=system, 1=user, 2=assistant
const DEFAULT_USER_BUBBLE_COLOR = '#E8F0FE';

const normalizeBubbleColor = (value) => {
    const raw = String(value || '').trim();
    return /^#[0-9A-F]{6}$/i.test(raw) ? raw : DEFAULT_USER_BUBBLE_COLOR;
};

export class PersonaStore {
    constructor() {
        this.personas = [];
        this.activeId = 'default';
        this.ready = this.init();
    }

    async init() {
        await this.load();
    }

    async load() {
        try {
            // Try loading from Tauri KV first (disk)
            let data = await safeInvoke('load_kv', { name: STORAGE_KEY });
            let active = await safeInvoke('load_kv', { name: ACTIVE_KEY });

            // Fallback to localStorage
            if (!data) {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) data = JSON.parse(raw);
            }
            if (!active) {
                active = localStorage.getItem(ACTIVE_KEY);
            }

            const incoming = Array.isArray(data) ? data : [];
            let changed = false;
            this.personas = incoming.map((p) => {
                const obj = (p && typeof p === 'object') ? p : {};
                const position = Number.isFinite(Number(obj.position)) ? Number(obj.position) : persona_description_positions.IN_PROMPT;
                const depth = Number.isFinite(Number(obj.depth)) ? Math.max(0, Math.trunc(Number(obj.depth))) : DEFAULT_DEPTH;
                const role = Number.isFinite(Number(obj.role)) ? Math.max(0, Math.min(2, Math.trunc(Number(obj.role)))) : DEFAULT_ROLE;
                const source = (obj.source && typeof obj.source === 'object') ? obj.source : null;
                const originalCard = (obj.originalCard && typeof obj.originalCard === 'object') ? obj.originalCard : null;
                const normalized = {
                    id: String(obj.id || '').trim() || `persona_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    name: String(obj.name || '').trim() || '我',
                    avatar: typeof obj.avatar === 'string' ? obj.avatar : '',
                    description: typeof obj.description === 'string' ? obj.description : '',
                    userBubbleColor: normalizeBubbleColor(obj.userBubbleColor),
                    position,
                    depth,
                    role,
                    created: Number.isFinite(Number(obj.created)) ? Number(obj.created) : Date.now(),
                    updated: Number.isFinite(Number(obj.updated)) ? Number(obj.updated) : Date.now(),
                    source,
                    originalCard,
                };
                if (
                    normalized.id !== obj.id ||
                    normalized.name !== obj.name ||
                    normalized.avatar !== obj.avatar ||
                    normalized.description !== obj.description ||
                    normalized.userBubbleColor !== obj.userBubbleColor ||
                    normalized.position !== obj.position ||
                    normalized.depth !== obj.depth ||
                    normalized.role !== obj.role ||
                    normalized.created !== obj.created ||
                    normalized.updated !== obj.updated ||
                    (obj.source && typeof obj.source !== 'object') ||
                    (obj.originalCard && typeof obj.originalCard !== 'object')
                ) {
                    changed = true;
                }
                return normalized;
            });
            this.activeId = active || 'default';

            // Ensure default persona exists
            if (this.personas.length === 0) {
                this.personas.push(this.createDefaultPersona());
                this.activeId = 'default';
                await this.save();
            } else if (!this.personas.find(p => p.id === this.activeId)) {
                this.activeId = this.personas[0].id;
                await this.save();
            }
            // Persist normalization upgrades (backfill position/depth/role, etc.)
            if (changed) await this.save();
            
            logger.info(`PersonaStore loaded: ${this.personas.length} personas, active: ${this.activeId}`);
        } catch (err) {
            logger.error('PersonaStore load failed', err);
            // Fallback to default in memory
            this.personas = [this.createDefaultPersona()];
            this.activeId = 'default';
        }
    }

    createDefaultPersona() {
        return {
            id: 'default',
            name: '我',
            avatar: '', // Will fallback to app default in UI
            description: '',
            userBubbleColor: DEFAULT_USER_BUBBLE_COLOR,
            position: persona_description_positions.IN_PROMPT,
            depth: DEFAULT_DEPTH,
            role: DEFAULT_ROLE,
            created: Date.now(),
            updated: Date.now(),
            source: null,
            originalCard: null
        };
    }

    async save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.personas));
            localStorage.setItem(ACTIVE_KEY, this.activeId);

            await safeInvoke('save_kv', { name: STORAGE_KEY, data: this.personas });
            await safeInvoke('save_kv', { name: ACTIVE_KEY, data: this.activeId });
        } catch (err) {
            logger.warn('PersonaStore save failed', err);
        }
    }

    getAll() {
        return this.personas;
    }

    get(id) {
        return this.personas.find(p => p.id === id);
    }

    getActive() {
        return this.get(this.activeId) || this.personas[0] || this.createDefaultPersona();
    }

    async setActive(id) {
        if (this.get(id)) {
            this.activeId = id;
            await this.save();
            return true;
        }
        return false;
    }

    async create(data) {
        const id = `persona_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const position = Number.isFinite(Number(data?.position)) ? Number(data.position) : persona_description_positions.IN_PROMPT;
        const depth = Number.isFinite(Number(data?.depth)) ? Math.max(0, Math.trunc(Number(data.depth))) : DEFAULT_DEPTH;
        const role = Number.isFinite(Number(data?.role)) ? Math.max(0, Math.min(2, Math.trunc(Number(data.role)))) : DEFAULT_ROLE;
        const newPersona = {
            id,
            name: data.name || 'User',
            avatar: data.avatar || '',
            description: data.description || '',
            userBubbleColor: normalizeBubbleColor(data.userBubbleColor),
            position,
            depth,
            role,
            created: Date.now(),
            updated: Date.now(),
            source: (data && typeof data.source === 'object') ? data.source : null,
            originalCard: (data && typeof data.originalCard === 'object') ? data.originalCard : null
        };
        this.personas.push(newPersona);
        await this.save();
        return newPersona;
    }

    async update(id, data) {
        const idx = this.personas.findIndex(p => p.id === id);
        if (idx === -1) return null;

        const next = { ...data };
        if (data && Object.prototype.hasOwnProperty.call(data, 'position')) {
            const pos = Number(data.position);
            next.position = Number.isFinite(pos) ? pos : persona_description_positions.IN_PROMPT;
        }
        if (data && Object.prototype.hasOwnProperty.call(data, 'depth')) {
            const d = Number(data.depth);
            next.depth = Number.isFinite(d) ? Math.max(0, Math.trunc(d)) : DEFAULT_DEPTH;
        }
        if (data && Object.prototype.hasOwnProperty.call(data, 'role')) {
            const r = Number(data.role);
            next.role = Number.isFinite(r) ? Math.max(0, Math.min(2, Math.trunc(r))) : DEFAULT_ROLE;
        }
        if (data && Object.prototype.hasOwnProperty.call(data, 'userBubbleColor')) {
            next.userBubbleColor = normalizeBubbleColor(data.userBubbleColor);
        }
        if (data && Object.prototype.hasOwnProperty.call(data, 'source')) {
            next.source = (data.source && typeof data.source === 'object') ? data.source : null;
        }
        if (data && Object.prototype.hasOwnProperty.call(data, 'originalCard')) {
            next.originalCard = (data.originalCard && typeof data.originalCard === 'object') ? data.originalCard : null;
        }

        this.personas[idx] = {
            ...this.personas[idx],
            ...next,
            updated: Date.now()
        };
        await this.save();
        return this.personas[idx];
    }

    async delete(id) {
        // Prevent deleting the last persona
        if (this.personas.length <= 1) return false;

        const idx = this.personas.findIndex(p => p.id === id);
        if (idx === -1) return false;

        this.personas.splice(idx, 1);

        // If deleted active persona, switch to another
        if (id === this.activeId) {
            this.activeId = this.personas[0].id;
        }

        await this.save();
        return true;
    }
}
