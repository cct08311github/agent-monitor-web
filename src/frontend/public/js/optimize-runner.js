(function () {
    function runAutoOptimize() {
        const btn = document.getElementById('optimizeBtn');
        const progressEl = document.getElementById('optimizeProgress');
        if (!btn || !progressEl) return;

        btn.disabled = true;
        btn.textContent = '⏳ 優化進行中...';
        progressEl.style.display = 'block';
        progressEl.innerHTML = '';

        function upsertStep(step, msg, done) {
            const id = 'opt-step-' + step;
            let el = document.getElementById(id);
            if (!el) {
                el = document.createElement('div');
                el.id = id;
                el.style.cssText = 'padding:3px 0;color:var(--text-secondary)';
                progressEl.appendChild(el);
            }
            el.textContent = (done ? '✅ ' : '⏳ ') + msg;
        }

        const stream = window.streamManager.connect('/api/optimize/run', {
            autoReconnect: false,
            events: {
                progress(e) {
                    try {
                        const { step, msg } = JSON.parse(e.data);
                        const prevEl = document.getElementById('opt-step-' + (step - 1));
                        if (prevEl && prevEl.textContent.startsWith('⏳')) {
                            prevEl.textContent = '✅ ' + prevEl.textContent.slice(3);
                        }
                        upsertStep(step, msg, false);
                    } catch (_) { }
                },
                done(e) {
                    try {
                        const { filename, opusFailed } = JSON.parse(e.data);
                        [6, 7].forEach(n => {
                            const el = document.getElementById('opt-step-' + n);
                            if (el && el.textContent.startsWith('⏳')) el.textContent = '✅ ' + el.textContent.slice(3);
                        });
                        const result = document.createElement('div');
                        result.style.cssText = 'margin-top:8px;padding:8px;background:var(--bg-muted);border-radius:6px';
                        const label = document.createTextNode('✅ 報告已生成：');
                        const strong = document.createElement('strong');
                        strong.textContent = filename;
                        result.appendChild(label);
                        result.appendChild(strong);
                        if (opusFailed) {
                            const note = document.createElement('span');
                            note.style.color = 'var(--text-muted)';
                            note.textContent = ' (未完整經 Opus 審查)';
                            result.appendChild(note);
                        }
                        progressEl.appendChild(result);
                    } catch (_) { }
                    btn.disabled = false;
                    btn.textContent = '🔍 執行自主優化';
                    stream.close();
                },
                cooldown(e) {
                    try {
                        const { remaining } = JSON.parse(e.data);
                        const infoEl = document.createElement('div');
                        infoEl.style.cssText = 'color:var(--text-muted);margin-top:8px';
                        infoEl.textContent = `⏸ 優化冷卻中，還需等待約 ${remaining} 分鐘`;
                        progressEl.appendChild(infoEl);
                    } catch (_) { }
                    btn.disabled = false;
                    btn.textContent = '🔍 執行自主優化';
                    progressEl.style.display = 'none';
                    stream.close();
                },
                error(e) {
                    try {
                        const { msg } = JSON.parse(e.data);
                        const errEl = document.createElement('div');
                        errEl.style.cssText = 'color:var(--red,#e74c3c);margin-top:8px';
                        errEl.textContent = '❌ ' + msg;
                        progressEl.appendChild(errEl);
                    } catch (_) { }
                    btn.disabled = false;
                    btn.textContent = '🔍 執行自主優化';
                    stream.close();
                }
            },
            onError() {
                btn.disabled = false;
                btn.textContent = '🔍 執行自主優化';
                stream.close();
            }
        });
    }

    window.runAutoOptimize = runAutoOptimize;
})();
