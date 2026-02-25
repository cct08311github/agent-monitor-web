/* ========================================
   OpenClaw Watch Pro - Theme Manager
   Handles dark/light mode switching with system preference detection and localStorage persistence.
   ======================================== */

const ThemeManager = {
    // Configuration
    STORAGE_KEY: 'oc_theme',
    THEMES: {
        LIGHT: 'light',
        DARK: 'dark',
        AUTO: 'auto'
    },

    // State
    currentTheme: null,

    // Initialize theme manager
    init() {
        this.loadTheme();
        this.applyTheme();
        this.setupEventListeners();
        this.renderThemeToggle();
        console.log('ThemeManager initialized with theme:', this.currentTheme);
    },

    // Load theme from localStorage or detect system preference
    loadTheme() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored && Object.values(this.THEMES).includes(stored)) {
            this.currentTheme = stored;
        } else {
            // Default to auto (system preference)
            this.currentTheme = this.THEMES.AUTO;
        }
    },

    // Save theme to localStorage
    saveTheme() {
        localStorage.setItem(this.STORAGE_KEY, this.currentTheme);
    },

    // Get effective theme (if auto, resolve to light or dark based on system preference)
    getEffectiveTheme() {
        if (this.currentTheme === this.THEMES.AUTO) {
            return this.prefersDark() ? this.THEMES.DARK : this.THEMES.LIGHT;
        }
        return this.currentTheme;
    },

    // Check if system prefers dark mode
    prefersDark() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    },

    // Apply theme to document root
    applyTheme() {
        const effective = this.getEffectiveTheme();
        const root = document.documentElement;

        // Always set data-theme attribute
        root.setAttribute('data-theme', effective);

        // Update meta theme-color for mobile browsers
        this.updateThemeColor(effective);
    },

    // Update meta theme-color tag
    updateThemeColor(theme) {
        let color = '#0f172a'; // default dark
        if (theme === this.THEMES.LIGHT) {
            color = '#f4f7fb'; // light background
        }
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }
        meta.content = color;
    },

    // Switch to specific theme
    setTheme(theme) {
        if (!Object.values(this.THEMES).includes(theme)) {
            console.warn('Invalid theme:', theme);
            return;
        }
        this.currentTheme = theme;
        this.saveTheme();
        this.applyTheme();
        this.renderThemeToggle();
        this.dispatchThemeChangeEvent();
    },

    // Cycle through themes (light → dark → auto)
    cycleTheme() {
        const order = [this.THEMES.LIGHT, this.THEMES.DARK, this.THEMES.AUTO];
        const currentIndex = order.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % order.length;
        this.setTheme(order[nextIndex]);
    },

    // Dispatch custom event for other components to react
    dispatchThemeChangeEvent() {
        const event = new CustomEvent('themechange', {
            detail: {
                theme: this.currentTheme,
                effective: this.getEffectiveTheme()
            }
        });
        document.dispatchEvent(event);
    },

    // Setup event listeners for system preference changes
    setupEventListeners() {
        // Listen for system preference changes (only matters when theme is auto)
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', () => {
            if (this.currentTheme === this.THEMES.AUTO) {
                this.applyTheme();
                this.renderThemeToggle();
                this.dispatchThemeChangeEvent();
            }
        });
    },

    // Render theme toggle UI in header
    renderThemeToggle() {
        // Use existing button if already in header
        const existingBtn = document.getElementById('themeToggleBtn');
        if (existingBtn) {
            const effective = this.getEffectiveTheme();
            const isAuto = this.currentTheme === this.THEMES.AUTO;
            
            let icon = '🌓'; // auto
            if (this.currentTheme === this.THEMES.LIGHT) icon = '☀️';
            if (this.currentTheme === this.THEMES.DARK) icon = '🌙';
            
            existingBtn.innerHTML = icon;
            existingBtn.title = `切換深色/淺色模式 (目前: ${isAuto ? '自動' : effective === 'dark' ? '深色' : '淺色'})`;
            return;
        }
        
        // Fallback: create container if needed
        let toggleContainer = document.getElementById('themeToggleContainer');
        if (!toggleContainer) {
            toggleContainer = document.createElement('div');
            toggleContainer.id = 'themeToggleContainer';
            toggleContainer.className = 'theme-toggle-container';
            const headerRight = document.querySelector('.header-right');
            if (headerRight) {
                headerRight.insertBefore(toggleContainer, headerRight.firstChild);
            }
        }

        const effective = this.getEffectiveTheme();
        const isAuto = this.currentTheme === this.THEMES.AUTO;
        
        let icon = '🌓'; // auto
        if (this.currentTheme === this.THEMES.LIGHT) icon = '☀️';
        if (this.currentTheme === this.THEMES.DARK) icon = '🌙';
        
        toggleContainer.innerHTML = `
            <button class="theme-toggle-btn" title="切換深色/淺色模式 (目前: ${isAuto ? '自動' : effective === 'dark' ? '深色' : '淺色'})">
                <span class="theme-toggle-icon">${icon}</span>
                <span class="theme-toggle-label">${effective === 'dark' ? '深色' : '淺色'}</span>
            </button>
        `;

        // Add click handler
        toggleContainer.querySelector('.theme-toggle-btn').addEventListener('click', () => {
            this.cycleTheme();
        });
    },

    // Get current theme for external use
    getCurrentTheme() {
        return this.currentTheme;
    },

    // Get effective theme for external use (duplicate method name fixed)
    getEffectiveThemeForExternal() {
        if (this.currentTheme === this.THEMES.AUTO) {
            return this.prefersDark() ? this.THEMES.DARK : this.THEMES.LIGHT;
        }
        return this.currentTheme;
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
} else {
    ThemeManager.init();
}

// Global access
window.ThemeManager = ThemeManager;

// Simple toggle function for inline onclick handler
window.toggleTheme = function() {
    console.log('toggleTheme called');
    if (typeof ThemeManager === 'undefined') {
        console.error('ThemeManager not defined');
        if (typeof showToast === 'function') showToast('❌ 主題管理器未載入', 'error');
        return;
    }
    ThemeManager.cycleTheme();
    if (typeof showToast === 'function') {
        const effective = ThemeManager.getEffectiveTheme();
        const isAuto = ThemeManager.getCurrentTheme() === 'auto';
        const message = isAuto ? '主題: 自動 (跟隨系統)' : 
                        effective === 'dark' ? '主題: 深色模式' : '主題: 淺色模式';
        showToast(message, 'info');
    }
};