/**
 * 宏处理引擎 (Macro Engine)
 * 兼容 SillyTavern 部分常用宏指令，用于在发送 Prompt 前处理变量和逻辑
 */

import { logger } from './logger.js';

const VARIABLE_MACRO_COMMANDS = new Set(['setvar', 'addvar', 'incvar', 'decvar', 'getvar', 'ifvar']);
const VARIABLE_MACRO_HEAD_RE = /^\s*(?:setvar|addvar|incvar|decvar|getvar|ifvar)\s*::/i;

export const stripPausedVariableMacros = (value = '') => {
    const text = String(value || '');
    if (!text.includes('{{')) return text;
    const stack = [];
    const ranges = [];
    for (let index = 0; index < text.length - 1; index += 1) {
        const pair = text.slice(index, index + 2);
        if (pair === '{{') {
            stack.push(index);
            index += 1;
            continue;
        }
        if (pair !== '}}' || !stack.length) continue;
        const start = stack.pop();
        const body = text.slice(start + 2, index).replace(/：：/g, '::');
        if (VARIABLE_MACRO_HEAD_RE.test(body)) ranges.push([start, index + 2]);
        index += 1;
    }
    if (!ranges.length) return text;
    ranges.sort((left, right) => left[0] - right[0] || right[1] - left[1]);
    const merged = [];
    ranges.forEach(([start, end]) => {
        const previous = merged[merged.length - 1];
        if (previous && start <= previous[1]) {
            previous[1] = Math.max(previous[1], end);
            return;
        }
        merged.push([start, end]);
    });
    let cursor = 0;
    let output = '';
    merged.forEach(([start, end]) => {
        output += text.slice(cursor, start);
        cursor = end;
    });
    return output + text.slice(cursor);
};

export class MacroEngine {
    constructor(chatStore) {
        this.chatStore = chatStore;
    }

    normalizeSeparators(text) {
        // Normalize full-width colons used in some IME inputs: ：：
        return String(text || '').replace(/：：/g, '::');
    }

    normalizeMacroValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return String(value);
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        // Support { name: '...' } pattern (user/char objects)
        if (typeof value === 'object' && typeof value.name === 'string') return value.name;
        return '';
    }

    getSessionId(context) {
        return String(context?.sessionId || 'default').trim() || 'default';
    }

    getVariableAccess(context, { useGlobal = false } = {}) {
        const sessionId = this.getSessionId(context);
        const simulated = context?.macroVariableState instanceof Map
            ? context.macroVariableState
            : null;
        const stateKey = key => `${useGlobal ? 'global' : `session:${sessionId}`}\u0000${String(key ?? '')}`;
        const readStore = key => (
            useGlobal
                ? this.chatStore?.getGlobalVariable?.(key)
                : this.chatStore?.getVariable?.(key, sessionId)
        );
        const writeStore = (key, value) => (
            useGlobal
                ? this.chatStore?.setGlobalVariable?.(key, value)
                : this.chatStore?.setVariable?.(key, value, sessionId)
        );
        return {
            get: (key) => {
                if (!simulated) return readStore(key);
                const scopedKey = stateKey(key);
                if (!simulated.has(scopedKey)) simulated.set(scopedKey, readStore(key));
                return simulated.get(scopedKey);
            },
            set: (key, value) => {
                if (!simulated) return writeStore(key, value);
                simulated.set(stateKey(key), value);
                return value;
            },
        };
    }

    getLastByRole(role, sessionId) {
        try {
            const msgs = this.chatStore?.getMessages?.(sessionId) || [];
            for (let i = msgs.length - 1; i >= 0; i--) {
                const m = msgs[i];
                if (!m) continue;
                if (String(m.role || '') !== role) continue;
                const raw = (typeof m.raw === 'string' && m.raw) ? m.raw : (typeof m.content === 'string' ? m.content : '');
                return String(raw || '');
            }
        } catch {}
        return '';
    }

    getLastIdByRole(role, sessionId) {
        try {
            const msgs = this.chatStore?.getMessages?.(sessionId) || [];
            for (let i = msgs.length - 1; i >= 0; i--) {
                const m = msgs[i];
                if (!m) continue;
                if (role && String(m.role || '') !== role) continue;
                const id = (m && typeof m.id === 'string') ? m.id : '';
                if (id) return id;
            }
        } catch {}
        return '';
    }

    getLastMessage(sessionId) {
        try {
            const msgs = this.chatStore?.getMessages?.(sessionId) || [];
            for (let i = msgs.length - 1; i >= 0; i--) {
                const m = msgs[i];
                if (!m) continue;
                const raw = (typeof m.raw === 'string' && m.raw) ? m.raw : (typeof m.content === 'string' ? m.content : '');
                if (raw) return String(raw);
            }
        } catch {}
        return '';
    }

    formatIsoDate(d = new Date()) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    formatIsoTime(d = new Date()) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    applyVariableMacros(text, context) {
        if (context?.variableRuntimeEnabled === false) {
            return stripPausedVariableMacros(text);
        }
        const useGlobal =
            context?.useGlobalVariables === true ||
            String(context?.uiMode || '').trim().toLowerCase() === 'rp';
        const variableAccess = this.getVariableAccess(context, { useGlobal });
        const getVar = key => variableAccess.get(key);
        const setVar = (key, value) => variableAccess.set(key, value);
        let out = String(text || '');
        const overrideLastUserMessage = (() => {
            const v = context?.lastUserMessage;
            const s = (typeof v === 'string') ? v : '';
            return s.trim() ? s : '';
        })();

        // Replace {{setvar::name::value}} with empty string and set local variable
        out = out.replace(/{{\s*setvar\s*::([^:}]+)::([^}]*)}}/gi, (_m, name, value) => {
            const key = String(name || '').trim();
            if (key) setVar(key, String(value ?? ''));
            return '';
        });
        // {{addvar::name::value}} - numeric add when possible
        out = out.replace(/{{\s*addvar\s*::([^:}]+)::([^}]*)}}/gi, (_m, name, value) => {
            const key = String(name || '').trim();
            if (!key) return '';
            const curRaw = getVar(key);
            const curNum = Number(curRaw);
            const addNum = Number(value);
            const next = (Number.isFinite(curNum) && Number.isFinite(addNum)) ? String(curNum + addNum) : `${String(curRaw ?? '')}${String(value ?? '')}`;
            setVar(key, next);
            return '';
        });
        // {{incvar::name}} / {{decvar::name}} return updated value
        out = out.replace(/{{\s*incvar\s*::([^}]+)}}/gi, (_m, name) => {
            const key = String(name || '').trim();
            const cur = Number(getVar(key));
            const next = (Number.isFinite(cur) ? cur : 0) + 1;
            setVar(key, String(next));
            return String(next);
        });
        out = out.replace(/{{\s*decvar\s*::([^}]+)}}/gi, (_m, name) => {
            const key = String(name || '').trim();
            const cur = Number(getVar(key));
            const next = (Number.isFinite(cur) ? cur : 0) - 1;
            setVar(key, String(next));
            return String(next);
        });
        out = out.replace(/{{\s*getvar\s*::([^}]+)}}/gi, (_m, name) => {
            const key = String(name || '').trim();
            const val = getVar(key);
            return (val === undefined || val === null) ? '' : String(val);
        });

        return out;
    }

    applyBuiltInMacros(text, context, baseVars) {
        const sessionId = this.getSessionId(context);
        let out = String(text || '');
        const user = String(baseVars?.user || 'User');
        const char = String(baseVars?.char || 'Assistant');
        const overrideLastUserMessage = (() => {
            const v = context?.lastUserMessage;
            const s = (typeof v === 'string') ? v : '';
            return s.trim() ? s : '';
        })();

        // Legacy non-curly macros (ST-style)
        out = out.replace(/<USER>/gi, user);
        out = out.replace(/<CHARIFNOTGROUP>/gi, baseVars?.group ? String(baseVars.group) : char);
        out = out.replace(/<GROUP>/gi, baseVars?.group ? String(baseVars.group) : '');
        out = out.replace(/<BOT>/gi, char);
        out = out.replace(/<CHAR>/gi, char);

        // Also accept lower-case variants (some IME / templates use these)
        out = out.replace(/<user>/gi, user);
        out = out.replace(/<char>/gi, char);
        out = out.replace(/<bot>/gi, char);

        // Common utility macros
        out = out.replace(/{{newline}}/gi, '\n');
        out = out.replace(/(?:\r?\n)*{{trim}}(?:\r?\n)*/gi, '');
        out = out.replace(/{{noop}}/gi, '');
        // {{// comment}} => removed
        out = out.replace(/\{\{\/\/([\s\S]*?)\}\}/gm, '');

        // Message macros (subset)
        out = out.replace(/{{lastMessage}}/gi, () => this.getLastMessage(sessionId));
        out = out.replace(/{{lastMessageId}}/gi, () => this.getLastIdByRole('', sessionId));
        // Accept a few common aliases used in templates.
        const lastUser = () => overrideLastUserMessage || this.getLastByRole('user', sessionId);
        out = out.replace(/{{lastUserMessage}}/gi, lastUser);
        out = out.replace(/{{userLastMessage}}/gi, lastUser);
        out = out.replace(/{{user_last_message}}/gi, lastUser);
        out = out.replace(/{{lastCharMessage}}/gi, () => this.getLastByRole('assistant', sessionId));
        out = out.replace(/{{lastUserMessageId}}/gi, () => this.getLastIdByRole('user', sessionId));
        out = out.replace(/{{lastCharMessageId}}/gi, () => this.getLastIdByRole('assistant', sessionId));

        // Time macros (subset, no moment.js dependency)
        out = out.replace(/{{time}}/gi, () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        out = out.replace(/{{date}}/gi, () => new Date().toLocaleDateString());
        out = out.replace(/{{weekday}}/gi, () => new Date().toLocaleDateString(undefined, { weekday: 'long' }));
        out = out.replace(/{{isotime}}/gi, () => this.formatIsoTime(new Date()));
        out = out.replace(/{{isodate}}/gi, () => this.formatIsoDate(new Date()));

        // Reverse macro: {{reverse:...}}
        out = out.replace(/{{reverse:(.+?)}}/gi, (_m, str) => Array.from(String(str ?? '')).reverse().join(''));

        return out;
    }

    /**
     * 处理文本中的宏
     * @param {string} text - 原始文本
     * @param {object} context - 上下文 { sessionId, user, char, ... }
     * @returns {string} 处理后的文本
     */
    process(text, context = {}) {
        if (!text || typeof text !== 'string') return '';
        if (!text.includes('{{') && !text.includes('<')) return text; // 快速返回

        let output = text;
        const maxPasses = 5; // 防止死循环
        let pass = 0;

        output = this.normalizeSeparators(output);

        const baseVars = {};
        // 基础变量（兼容 ST 常用 {{user}} / {{char}}）
        baseVars.user = this.normalizeMacroValue(context.user) || 'User';
        baseVars.char = this.normalizeMacroValue(context.char) || 'Assistant';

        // 允许直接传入其它简单变量：processTextMacros(text, { scenario: '...', personality: '...' })
        // （避免必须塞到 extraMacros 才能替换）
        try {
            for (const [k, v] of Object.entries(context || {})) {
                if (!k || k === 'sessionId' || k === 'user' || k === 'char' || k === 'extraMacros' || k === 'macroVariableState' || k === 'variableRuntimeEnabled') continue;
                const normalized = this.normalizeMacroValue(v);
                baseVars[k] = normalized;
            }
        } catch {}

        // 兼容旧调用：context.extraMacros
        if (context?.extraMacros && typeof context.extraMacros === 'object') {
            for (const [k, v] of Object.entries(context.extraMacros)) {
                if (!k) continue;
                const normalized = this.normalizeMacroValue(v);
                baseVars[k] = normalized;
            }
        }

        // Case-insensitive base variable lookup (SillyTavern presets often use {{USER}}/{{CHAR}})
        const baseVarsLower = Object.create(null);
        try {
            for (const [k, v] of Object.entries(baseVars)) {
                if (!k) continue;
                baseVarsLower[String(k).toLowerCase()] = v;
            }
        } catch {}

        // 匹配 {{...}}
        const macroRegex = /\{\{(.*?)\}\}/g;

        while (pass < maxPasses) {
            let hasMatch = false;
            let replacedInThisPass = false;

            // Apply built-ins + variables macros on every pass (ST ordering: pre-env macros first)
            const before = output;
            output = this.applyBuiltInMacros(output, context, baseVars);
            output = this.applyVariableMacros(output, context);
            if (output !== before) replacedInThisPass = true;

            output = output.replace(macroRegex, (match, content) => {
                hasMatch = true;
                const trimmed = this.normalizeSeparators(content).trim();
                const trimmedLower = trimmed.toLowerCase();

                // 1. 优先匹配基础变量 (e.g. {{user}})
                if (Object.prototype.hasOwnProperty.call(baseVars, trimmed)) {
                    replacedInThisPass = true;
                    return baseVars[trimmed];
                }
                if (Object.prototype.hasOwnProperty.call(baseVarsLower, trimmedLower)) {
                    replacedInThisPass = true;
                    return baseVarsLower[trimmedLower];
                }

                // 2. 解析指令 {{cmd::arg1::arg2}}
                const parts = trimmed.split(/::/);
                const cmd = parts[0].trim().toLowerCase();
                const rawArgs = parts.slice(1);
                const args = VARIABLE_MACRO_COMMANDS.has(cmd)
                    ? rawArgs.map(arg => String(arg || '').trim())
                    : rawArgs;

                // 如果没有参数且不是基础变量，可能是尚未定义的变量或者无效格式
                if (parts.length === 1 && !Object.prototype.hasOwnProperty.call(baseVars, trimmed) && !Object.prototype.hasOwnProperty.call(baseVarsLower, trimmedLower)) {
                    // 尝试作为 getvar 简写？ST 不支持 {{myVar}} 直接获取，必须 {{getvar::myVar}}
                    // 但为了方便，如果不是命令，我们可以保留原样
                    return match;
                }

                try {
                    const result = this.executeCommand(cmd, args, context);
                    if (result !== null) {
                        replacedInThisPass = true;
                        return result;
                    }
                } catch (err) {
                    logger.warn(`Macro exec failed: ${cmd}`, err);
                }
                
                // 无法处理或指令返回 null (表示不处理)，保持原样
                return match;
            });

            if (!hasMatch || !replacedInThisPass) break;
            pass++;
        }

        return output;
    }

    executeCommand(cmd, args, context) {
        // executeCommand 的既有语义是本地变量；常规 set/get 宏会先由
        // applyVariableMacros 依 uiMode/useGlobalVariables 处理。
        const variableAccess = this.getVariableAccess(context, { useGlobal: false });

        switch (cmd) {
            // --- 变量操作 ---
            case 'setvar': {
                if (context?.variableRuntimeEnabled === false) return '';
                // {{setvar::key::value}}
                if (args.length < 2) return '';
                const key = args[0];
                // 重新组合剩余部分，防止 value 内部还有 ::
                const val = args.slice(1).join('::'); 
                variableAccess.set(key, val);
                return ''; // setvar 消耗掉标签，输出为空
            }
            case 'getvar': {
                if (context?.variableRuntimeEnabled === false) return '';
                // {{getvar::key::default}}
                const key = args[0];
                const def = args[1] || '';
                const val = variableAccess.get(key);
                return (val !== undefined && val !== null) ? val : def;
            }
            case 'addvar': {
                if (context?.variableRuntimeEnabled === false) return '';
                // {{addvar::key::value}}
                if (args.length < 2) return '';
                const key = args[0];
                const addRaw = args.slice(1).join('::');
                const curRaw = variableAccess.get(key);
                const curNum = Number(curRaw);
                const addNum = Number(addRaw);
                const next = (Number.isFinite(curNum) && Number.isFinite(addNum)) ? String(curNum + addNum) : `${String(curRaw ?? '')}${String(addRaw ?? '')}`;
                variableAccess.set(key, next);
                return '';
            }
            case 'incvar': {
                if (context?.variableRuntimeEnabled === false) return '';
                // {{incvar::key::amount}}
                const key = args[0];
                const amt = Number(args[1]) || 1;
                let val = Number(variableAccess.get(key)) || 0;
                val += amt;
                variableAccess.set(key, val);
                return '';
            }
            case 'decvar': {
                if (context?.variableRuntimeEnabled === false) return '';
                // {{decvar::key::amount}}
                const key = args[0];
                const amt = Number(args[1]) || 1;
                let val = Number(variableAccess.get(key)) || 0;
                val -= amt;
                variableAccess.set(key, val);
                return '';
            }

            // --- 随机/工具 ---
            case 'random': {
                // {{random::A::B::C}}
                if (args.length === 0) return '';
                const idx = Math.floor(Math.random() * args.length);
                return args[idx];
            }
            case 'dice': {
                // {{dice::1d20}}
                const match = (args[0] || '').match(/^(\d+)d(\d+)$/i);
                if (!match) return args[0] || '';
                const count = parseInt(match[1]);
                const sides = parseInt(match[2]);
                let total = 0;
                for (let i = 0; i < count; i++) {
                    total += Math.floor(Math.random() * sides) + 1;
                }
                return String(total);
            }
            case 'time':
                return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            case 'date':
                return new Date().toLocaleDateString();
            
            // --- 逻辑控制 (简易版) ---
            case 'ifvar': {
                if (context?.variableRuntimeEnabled === false) return '';
                // {{ifvar::key::value::then::else}}
                if (args.length < 3) return '';
                const key = args[0];
                const checkVal = args[1];
                const thenVal = args[2] || '';
                const elseVal = args[3] || '';
                const current = String(variableAccess.get(key) || '');
                return current === checkVal ? thenVal : elseVal;
            }

            default:
                // 返回 null 表示此指令不是 macro 引擎处理的（或者拼写错误），保持原样
                return null;
        }
    }
}
