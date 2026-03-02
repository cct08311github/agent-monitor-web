// --- Charts ---
let sysHistoryData = [];
let costHistoryData = [];

function drawSparkline(canvasId, data, labels) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    const pad = { top: 22, right: 10, bottom: 24, left: 35 };
    const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    ctx.clearRect(0, 0, w, h);
    // Detect dark mode from data-theme attribute or system preference
    const theme = document.documentElement.getAttribute('data-theme');
    const isDark = theme === 'dark' || (theme === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    ctx.fillStyle = isDark ? '#1e293b' : '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    const colors = [
        { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.1)', label: 'CPU' },
        { stroke: '#22c55e', fill: 'rgba(34,197,94,0.1)', label: 'MEM' },
    ];

    ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (ch / 4) * i;
        ctx.fillText((100 - i * 25) + '%', pad.left - 4, y + 3);
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
    }

    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(data[0]?.length / 6) || 1);
    if (labels) {
        for (let i = 0; i < (data[0]?.length || 0); i += step) {
            const x = pad.left + (i / ((data[0]?.length || 1) - 1 || 1)) * cw;
            ctx.fillText(labels[i] || '', x, h - 4);
        }
    }

    ctx.textAlign = 'left';
    colors.forEach((c, idx) => {
        const lx = pad.left + idx * 60;
        ctx.fillStyle = c.stroke; ctx.fillRect(lx, 4, 10, 10);
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b'; ctx.fillText(c.label, lx + 14, 12);
    });

    data.forEach((series, si) => {
        if (!series || series.length === 0) return;
        const color = colors[si] || colors[0];
        ctx.beginPath(); ctx.moveTo(pad.left, pad.top + ch);
        series.forEach((val, i) => {
            const x = pad.left + (i / (series.length - 1 || 1)) * cw;
            const y = pad.top + ch - (Math.min(100, val) / 100) * ch;
            ctx.lineTo(x, y);
        });
        ctx.lineTo(pad.left + cw, pad.top + ch); ctx.closePath();
        ctx.fillStyle = color.fill; ctx.fill();
        ctx.beginPath();
        series.forEach((val, i) => {
            const x = pad.left + (i / (series.length - 1 || 1)) * cw;
            const y = pad.top + ch - (Math.min(100, val) / 100) * ch;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color.stroke; ctx.lineWidth = 1.5; ctx.stroke();
    });
}

function updateCharts() {
    if (sysHistoryData.length < 2) return;
    drawSparkline('sysChart', [sysHistoryData.map(d => d.cpu), sysHistoryData.map(d => d.memory)],
        sysHistoryData.map(d => { if (!d.timestamp) return ''; const t = new Date(d.timestamp + 'Z'); return `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`; }));
    if (document.getElementById('costSparkline') && costHistoryData.length > 1) {
        drawSparkline('costSparkline', [costHistoryData.map(r => r.total_cost || 0)], costHistoryData.map(r => (r.ts || '').slice(11, 16)));
    }
}

async function fetchHistory() {
    try {
        const res = await fetch('/api/read/history');
        const data = await res.json();
        if (data.success && data.history) { sysHistoryData = data.history; if (typeof currentDesktopTab !== 'undefined' && currentDesktopTab === 'system') updateCharts(); }
        if (data.costHistory) { costHistoryData = data.costHistory; if (typeof currentDesktopTab !== 'undefined' && currentDesktopTab === 'system') updateCharts(); }

    } catch (e) { /* silent */ }
}

function updateCostDisplay() {
    if (!latestDashboard) return;
    const range = document.getElementById('costRange').value;
    const agents = latestDashboard.agents || [];

    // Use the periodic costs from backend if available, otherwise fallback to legacy total cost
    let totalUSD = 0;
    if (range === 'all') {
        totalUSD = agents.reduce((s, a) => s + parseFloat(a.costs?.total ?? a.cost ?? 0), 0);
    } else {
        totalUSD = agents.reduce((s, a) => s + parseFloat(a.costs?.[range] ?? a.cost ?? 0), 0);
    }

    const rangeLabel = { today: '今日', week: '本週', month: '月', all: '全部' }[range] || '月';
    document.getElementById('sc4Label').textContent = `${rangeLabel}費用 (TWD)`;
    document.getElementById('totalCost').textContent = formatTWD(totalUSD);
}
