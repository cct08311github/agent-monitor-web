/**
 * Loading Manager — Skeleton loaders, button loading state, progress banner.
 */
(function () {
    'use strict';

    function showSkeletons(containerId, count, skeletonClass) {
        var container = document.getElementById(containerId);
        if (!container) return;
        skeletonClass = skeletonClass || 'agent-card-skeleton';
        for (var i = 0; i < count; i++) {
            var el = document.createElement('div');
            el.className = 'skeleton ' + skeletonClass;
            el.setAttribute('data-skeleton', 'true');
            container.appendChild(el);
        }
    }

    function clearSkeletons(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var skeletons = container.querySelectorAll('[data-skeleton="true"]');
        for (var i = 0; i < skeletons.length; i++) {
            skeletons[i].parentNode.removeChild(skeletons[i]);
        }
    }

    function setButtonLoading(btn, loading) {
        if (!btn) return;
        if (loading) {
            btn.classList.add('btn-loading');
            btn.setAttribute('aria-busy', 'true');
            btn._originalDisabled = btn.disabled;
            btn.disabled = true;
        } else {
            btn.classList.remove('btn-loading');
            btn.removeAttribute('aria-busy');
            btn.disabled = btn._originalDisabled || false;
            delete btn._originalDisabled;
        }
    }

    function showProgress(msg) {
        var banner = document.getElementById('progressBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'progressBanner';
            banner.className = 'progress-banner';
            banner.setAttribute('role', 'status');
            banner.setAttribute('aria-live', 'polite');
            var header = document.querySelector('.app-header');
            if (header && header.nextSibling) {
                header.parentNode.insertBefore(banner, header.nextSibling);
            } else {
                document.body.appendChild(banner);
            }
        }
        banner.textContent = msg || '處理中…';
        banner.style.display = 'block';
    }

    function hideProgress() {
        var banner = document.getElementById('progressBanner');
        if (banner) banner.style.display = 'none';
    }

    var api = {
        showSkeletons: showSkeletons,
        clearSkeletons: clearSkeletons,
        setButtonLoading: setButtonLoading,
        showProgress: showProgress,
        hideProgress: hideProgress
    };

    if (window.App && window.App.register) {
        App.register('LoadingManager', api);
    }
    window.LoadingManager = api;
})();
