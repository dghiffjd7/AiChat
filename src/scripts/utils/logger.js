/**
 * 日志工具 - 支持级别控制和格式化输出
 */

export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

class Logger {
    constructor() {
        this.level = LogLevel.INFO;
        this.enableTimestamp = true;
        this.enableStackTrace = false;
        this.debugPanel = null;

        // 从 localStorage 恢复日志级别
        const saved = localStorage.getItem('log_level');
        if (saved !== null) {
            this.level = parseInt(saved);
        }

        // 懒加载调试面板
        setTimeout(() => {
            try {
                import('../ui/debug-panel.js').then(module => {
                    this.debugPanel = module.getDebugPanel();
                }).catch(() => {});
            } catch {}
        }, 1000);
    }

    /**
     * 设置日志级别
     */
    setLevel(level) {
        this.level = level;
        localStorage.setItem('log_level', level.toString());
    }

    /**
     * 获取当前日志级别名称
     */
    getLevelName() {
        const names = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];
        return names[this.level] || 'UNKNOWN';
    }

    /**
     * 内部日志方法
     */
    _log(level, levelName, color, ...args) {
        if (level < this.level) return;

        const prefix = this.enableTimestamp
            ? `[${new Date().toISOString()}] ${levelName}:`
            : `${levelName}:`;

        console.log(`%c${prefix}`, `color: ${color}; font-weight: bold`, ...args);

        // 输出到调试面板（仅 INFO/WARN/ERROR）
        if (level >= LogLevel.INFO && this.debugPanel) {
            try {
                const message = args.map(a => String(a)).join(' ');
                const type = levelName.toLowerCase();
                this.debugPanel.log(message, type);
            } catch {}
        }

        if (this.enableStackTrace && level >= LogLevel.ERROR) {
            console.trace();
        }
    }

    debug(...args) {
        this._log(LogLevel.DEBUG, 'DEBUG', '#999', ...args);
    }

    info(...args) {
        this._log(LogLevel.INFO, 'INFO', '#007bff', ...args);
    }

    warn(...args) {
        this._log(LogLevel.WARN, 'WARN', '#ff9800', ...args);
    }

    error(...args) {
        this._log(LogLevel.ERROR, 'ERROR', '#f44336', ...args);
    }

    /**
     * 分组日志
     */
    group(title, callback) {
        console.group(title);
        try {
            callback();
        } finally {
            console.groupEnd();
        }
    }

    /**
     * 性能计时
     */
    time(label) {
        console.time(label);
    }

    timeEnd(label) {
        console.timeEnd(label);
    }
}

export const logger = new Logger();
