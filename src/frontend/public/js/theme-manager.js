/**
 * Theme Manager for Agent Monitor Web
 * Handles Light/Dark mode switching and persistence
 */
const ThemeManager = {
    init() {
        const savedTheme = localStorage.getItem('oc_theme') || 'auto';
        this.setTheme(savedTheme);
        
        // Listen for system theme changes if set to auto
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (localStorage.getItem('oc_theme') === 'auto' || !localStorage.getItem('oc_theme')) {
                this.applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    },

    setTheme(theme) {
        localStorage.setItem('oc_theme', theme);
        if (theme === 'auto') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.applyTheme(isDark ? 'dark' : 'light');
        } else {
            this.applyTheme(theme);
        }
        this.updateUI(theme);
    },

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        // Update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', theme === 'dark' ? '#0f172a' : '#f4f7fb');
        }
    },

    updateUI(theme) {
        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            btn.innerHTML = theme === 'dark' ? '🌙' : (theme === 'light' ? '☀️' : '🌓');
            btn.title = `主題: ${theme === 'dark' ? '深色' : (theme === 'light' ? '淺色' : '自動')}`;
        }
    },

    toggle() {
        const current = localStorage.getItem('oc_theme') || 'auto';
        let next;
        if (current === 'auto') next = 'light';
        else if (current === 'light') next = 'dark';
        else next = 'auto';
        this.setTheme(next);
        showToast(`主題已切換為: ${next === 'auto' ? '自動' : (next === 'dark' ? '深色' : '淺色')}`, 'info');
    }
};

// Initialize theme as early as possible to avoid flash
ThemeManager.init();
