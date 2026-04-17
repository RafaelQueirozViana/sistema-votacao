const API = 'http://localhost:3000';
const ESPECIAIS = ['branco', 'nulo'];
let winnerText;
let _autoRefreshTimer = null;

function iniciarAutoRefresh() {
    pararAutoRefresh();
    _autoRefreshTimer = setInterval(carregarVisaoGeral, 5000);
}

function pararAutoRefresh() {
    if (_autoRefreshTimer) {
        clearInterval(_autoRefreshTimer);
        _autoRefreshTimer = null;
    }
}

// ─────────────────────────────────────────────
// SIDEBAR MOBILE
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (toggle) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('open');
        });
    }
});

function fecharSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

async function fazerLogin() {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    const erro = document.getElementById('login-erro');
    erro.textContent = '';

    try {
        const res = await fetch(API + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: user, senha: pass })
        });
        const data = await res.json();

        if (data.ok) {
            document.getElementById('tela-login').style.display = 'none';
            document.getElementById('tela-painel').style.display = 'flex';
            carregarVisaoGeral();
            iniciarAutoRefresh();
        } else {
            erro.textContent = data.mensagem || 'Usuário ou senha incorretos.';
        }
    } catch {
        erro.textContent = 'Não foi possível conectar ao servidor.';
    }
}

document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('tela-login').style.display !== 'none') {
        fazerLogin();
    }
});

function sair() {
    pararAutoRefresh();
    document.getElementById('tela-painel').style.display = 'none';
    document.getElementById('tela-login').style.display = 'flex';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-erro').textContent = '';
}

// ─────────────────────────────────────────────
// ABAS
// ─────────────────────────────────────────────

function mostrarAba(aba, btn) {
    document.querySelectorAll('.aba').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('aba-' + aba).style.display = 'block';
    btn.classList.add('active');
    fecharSidebar();

    if (aba === 'visao-geral') { carregarVisaoGeral(); iniciarAutoRefresh(); }
    else { pararAutoRefresh(); }

    if (aba === 'relatorio') carregarRelatorio();
    if (aba === 'historico') carregarHistorico();
}

// ─────────────────────────────────────────────
// VISÃO GERAL
// ─────────────────────────────────────────────

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function calcPct(votos, totalValidos) {
    if (!totalValidos) return '—';
    return (votos / totalValidos * 100).toFixed(1) + '%';
}

function renderWinnerBanner(normais, containerId) {
    const el = document.getElementById(containerId);
    if (!normais.length) { el.style.display = 'none'; return; }

    const maxVotos = normais[0].total;
    const vencedores = normais.filter(r => r.total === maxVotos);
    const empate = vencedores.length > 1;

    if (empate) {
        el.innerHTML = `
            <div class="winner-banner-inner empate">
                <div class="winner-banner-label">Empate</div>
                <div class="winner-banner-nomes">${vencedores.map(v => capitalize(v.candidato)).join(' · ')}</div>
                <div class="winner-banner-votos">${maxVotos} votos cada</div>
            </div>`;
    } else {
        el.innerHTML = `
            <div class="winner-banner-inner">
                <div class="winner-banner-label">🏆 Vencedor</div>
                <div class="winner-banner-nome">${capitalize(normais[0].candidato)}</div>
                <div class="winner-banner-votos">${normais[0].total} votos</div>
            </div>`;
    }
    el.style.display = 'block';
}

function renderTabelaResultado(tbId, normais, especiais, totalValidos) {
    const tb = document.getElementById(tbId);
    if (normais.length === 0) {
        tb.innerHTML = `<tr><td colspan="4" class="empty-row">Nenhum voto registrado ainda</td></tr>`;
        return;
    }
    tb.innerHTML =
        normais.map((item, i) => `
            <tr>
                <td>${i + 1}° Lugar</td>
                <td>${capitalize(item.candidato)}</td>
                <td class="right">${item.total}</td>
                <td class="right">${calcPct(item.total, totalValidos)}</td>
            </tr>
        `).join('') +
        especiais.map(item => `
            <tr>
                <td class="dim">—</td>
                <td class="dim">${capitalize(item.candidato)}</td>
                <td class="right dim">${item.total}</td>
                <td class="right dim">—</td>
            </tr>
        `).join('');
}

async function carregarVisaoGeral() {
    try {
        const [resStatus, resResultado] = await Promise.all([
            fetch(API + '/status'),
            fetch(API + '/resultado'),
        ]);

        const status = await resStatus.json();
        const resultado = await resResultado.json();

        // ── badges e botões ──
        const badge = document.getElementById('status-badge');
        const statusTxt = document.getElementById('status-texto');
        const btnIniciar = document.getElementById('btn-iniciar');
        const btnEnc = document.getElementById('btn-encerrar');

        if (status.aberta) {
            badge.textContent = 'Votação em andamento';
            badge.className = 'badge aberta';
            statusTxt.textContent = 'Votação em andamento';
            btnIniciar.disabled = true;
            btnEnc.disabled = false;
        } else {
            badge.textContent = status.iniciada ? 'Encerrada' : 'Aguardando';
            badge.className = status.iniciada ? 'badge encerrada' : 'badge aguardando';
            statusTxt.textContent = status.iniciada ? 'Votação encerrada' : 'Votação não iniciada';
            btnIniciar.disabled = false;
            btnEnc.disabled = true;
        }

        // ── métricas ──
        const normais = resultado.filter(r => !ESPECIAIS.includes(r.candidato.toLowerCase()));
        const especiais = resultado.filter(r => ESPECIAIS.includes(r.candidato.toLowerCase()));
        normais.sort((a, b) => b.total - a.total);

        const totalVotos = resultado.reduce((s, r) => s + r.total, 0);
        const totalInvalidos = especiais.reduce((s, r) => s + r.total, 0);
        const totalValidos = normais.reduce((s, r) => s + r.total, 0);

        document.getElementById('total-votos').textContent = totalVotos;
        document.getElementById('total-invalidos').textContent = totalInvalidos;

        // ── seção de resultados: escolhe qual painel exibir ──
        const elVazio = document.getElementById('resultado-vazio');
        const elAtivo = document.getElementById('resultado-ativo');
        const elFinal = document.getElementById('resultado-final');

        if (!status.iniciada && !status.aberta) {
            // Nunca foi iniciada
            elVazio.style.display = 'flex';
            elAtivo.style.display = 'none';
            elFinal.style.display = 'none';
        } else if (status.aberta) {
            // Em andamento — apuração ao vivo
            elVazio.style.display = 'none';
            elAtivo.style.display = 'block';
            elFinal.style.display = 'none';
            renderTabelaResultado('tabela-resultado', normais, especiais, totalValidos);
        } else {
            // Encerrada — resultado final
            elVazio.style.display = 'none';
            elAtivo.style.display = 'none';
            elFinal.style.display = 'block';
            renderWinnerBanner(normais, 'winner-banner');
            renderTabelaResultado('tabela-resultado-final', normais, especiais, totalValidos);
        }

    } catch {
        alert('Erro ao carregar dados do servidor.');
    }
}

// ─────────────────────────────────────────────
// CONTROLES DE VOTAÇÃO
// ─────────────────────────────────────────────

async function iniciarVotacao() {
    const resStatus = await fetch(API + '/status');
    const status = await resStatus.json();

    if (status.iniciada && !status.aberta) {
        if (!confirm('Existe uma votação encerrada. Iniciar uma nova irá substituí-la. Deseja continuar?')) return;
    }

    abrirModal();
}

async function encerrarVotacao() {
    if (!confirm('Deseja encerrar a votação? Esta ação não pode ser desfeita.')) return;
    await fetch(API + '/encerrar', { method: 'POST' });
    await fetch(API + '/arquivar', { method: 'POST' });
    carregarVisaoGeral();
}

// ─────────────────────────────────────────────
// MODAL DE NOVA VOTAÇÃO
// ─────────────────────────────────────────────

let candidatosModal = [];

function abrirModal() {
    candidatosModal = [];
    renderizarListaModal();
    document.getElementById('input-candidato').value = '';
    document.getElementById('input-nome-votacao').value = '';
    document.getElementById('input-desc-votacao').value = '';
    document.getElementById('modal-erro').textContent = '';

    // Preenche a data atual automaticamente
    const agora = new Date();
    document.getElementById('input-data-votacao').value =
        agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' +
        agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    document.getElementById('modal-overlay').style.display = 'flex';
    setTimeout(() => document.getElementById('input-nome-votacao').focus(), 100);
}

function fecharModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    candidatosModal = [];
}

function adicionarCandidato() {
    const input = document.getElementById('input-candidato');
    const erro = document.getElementById('modal-erro');
    const nome = input.value.trim();

    if (!nome) { erro.textContent = 'Digite o nome do candidato.'; return; }
    if (ESPECIAIS.includes(nome.toLowerCase())) { erro.textContent = 'Branco e Nulo são adicionados automaticamente.'; return; }
    if (candidatosModal.map(c => c.toLowerCase()).includes(nome.toLowerCase())) { erro.textContent = 'Candidato já adicionado.'; return; }

    candidatosModal.push(nome);
    erro.textContent = '';
    input.value = '';
    input.focus();
    renderizarListaModal();
}

function removerCandidato(index) {
    candidatosModal.splice(index, 1);
    renderizarListaModal();
}

function renderizarListaModal() {
    const lista = document.getElementById('lista-candidatos');
    lista.innerHTML = candidatosModal.length === 0 ? '' :
        candidatosModal.map((nome, i) => `
            <div class="candidato-item">
                <span>${nome}</span>
                <button onclick="removerCandidato(${i})">×</button>
            </div>
        `).join('');
}

document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('modal-overlay').style.display !== 'none') {
        // Se o foco está no campo de candidato, adiciona candidato
        if (document.activeElement === document.getElementById('input-candidato')) {
            adicionarCandidato();
        }
    }
});

async function confirmarInicio() {
    const erro = document.getElementById('modal-erro');
    const nome = document.getElementById('input-nome-votacao').value.trim();
    const desc = document.getElementById('input-desc-votacao').value.trim();

    if (!nome) { erro.textContent = 'Informe o nome da votação.'; document.getElementById('input-nome-votacao').focus(); return; }
    if (candidatosModal.length === 0) { erro.textContent = 'Adicione ao menos um candidato.'; return; }

    // Reseta para a nova votação
    await fetch(API + '/resetar', { method: 'DELETE' });

    // Salva metadados da nova votação
    await fetch(API + '/votacao-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, descricao: desc })
    });

    // Salva candidatos
    await fetch(API + '/candidatos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidatos: candidatosModal })
    });

    // Inicia a votação
    await fetch(API + '/iniciar', { method: 'POST' });

    fecharModal();
    carregarVisaoGeral();
}

// ─────────────────────────────────────────────
// RELATÓRIO DE HORÁRIOS
// ─────────────────────────────────────────────

async function carregarRelatorio() {
    try {
        const res = await fetch(API + '/relatorio');
        const data = await res.json();
        const tb = document.getElementById('tabela-relatorio');

        if (!data || data.length === 0) {
            tb.innerHTML = '<tr><td colspan="2" class="empty-row">Nenhum voto registrado ainda</td></tr>';
        } else {
            tb.innerHTML = data.map(row => `
                <tr>
                    <td>${row.idFuncionario}</td>
                    <td class="right">${new Date(row.dataHora).toLocaleString('pt-BR')}</td>
                </tr>
            `).join('');
        }
    } catch {
        alert('Erro ao carregar relatório.');
    }
}

// ─────────────────────────────────────────────
// HISTÓRICO DE VOTAÇÕES
// ─────────────────────────────────────────────

async function carregarHistorico() {
    const lista = document.getElementById('historico-lista');
    lista.innerHTML = '<p class="hist-loading">Carregando...</p>';

    try {
        const res = await fetch(API + '/historico');
        const data = await res.json();

        if (!data || data.length === 0) {
            lista.innerHTML = `
                <div class="hist-vazio">
                    <p>Nenhuma votação no histórico ainda.</p>
                    <p style="font-size:0.8rem;margin-top:4px">As votações encerradas aparecerão aqui.</p>
                </div>`;
            return;
        }

        lista.innerHTML = data.map(v => `
            <div class="hist-card">
                <div class="hist-card-info">
                    <p class="hist-card-nome">${escapeHtml(v.nome)}</p>
                    <p class="hist-card-data">📅 ${new Date(v.dataCriacao).toLocaleString('pt-BR')}</p>
                </div>
                <div class="hist-card-actions">
                    <button class="btn-hist-view" onclick="visualizarVotacao(${v.id})">Visualizar</button>
                    <button class="btn-hist-del"  onclick="excluirVotacao(${v.id}, this)">Excluir</button>
                </div>
            </div>
        `).join('');

    } catch {
        lista.innerHTML = '<p class="hist-loading" style="color:#c0392b">Erro ao carregar histórico.</p>';
    }
}

async function visualizarVotacao(id) {
    try {
        const res = await fetch(API + '/historico/' + id);
        const data = await res.json();

        document.getElementById('hist-modal-nome').textContent = data.nome || '—';

        const descEl = document.getElementById('hist-modal-desc');
        descEl.textContent = data.descricao || '';
        descEl.style.display = data.descricao ? 'block' : 'none';

        // Datas
        document.getElementById('hist-modal-data-criacao').textContent =
            data.dataCriacao ? new Date(data.dataCriacao).toLocaleString('pt-BR') : '—';
        document.getElementById('hist-modal-data-encerramento').textContent =
            data.dataEncerramento ? new Date(data.dataEncerramento).toLocaleString('pt-BR') : '—';

        const tb = document.getElementById('hist-modal-tabela');
        const vazio = document.getElementById('hist-modal-vazio');
        const votos = data.votos || [];

        const normais = votos.filter(r => !ESPECIAIS.includes(r.candidato.toLowerCase()));
        const especiais = votos.filter(r => ESPECIAIS.includes(r.candidato.toLowerCase()));
        normais.sort((a, b) => b.total - a.total);

        const totalValidos = normais.reduce((s, r) => s + r.total, 0);

        // Banner de vencedor
        renderWinnerBanner(normais, 'hist-winner-banner');

        if (votos.length === 0) {
            tb.innerHTML = '';
            vazio.style.display = 'block';
            document.getElementById('hist-winner-banner').style.display = 'none';
        } else {
            vazio.style.display = 'none';
            tb.innerHTML =
                normais.map((item, i) => `
                    <tr style="border-bottom:1px solid var(--border)">
                        <td style="padding:12px 16px;font-size:0.9rem">${i + 1}° Lugar</td>
                        <td style="padding:12px 16px;font-size:0.9rem">${capitalize(item.candidato)}</td>
                        <td style="padding:12px 16px;font-size:0.9rem;text-align:right">${item.total}</td>
                        <td style="padding:12px 16px;font-size:0.9rem;text-align:right">${calcPct(item.total, totalValidos)}</td>
                    </tr>
                `).join('') +
                especiais.map(item => `
                    <tr style="border-bottom:1px solid var(--border)">
                        <td style="padding:12px 16px;font-size:0.9rem;color:var(--muted)">—</td>
                        <td style="padding:12px 16px;font-size:0.9rem;color:var(--muted)">${capitalize(item.candidato)}</td>
                        <td style="padding:12px 16px;font-size:0.9rem;text-align:right;color:var(--muted)">${item.total}</td>
                        <td style="padding:12px 16px;font-size:0.9rem;text-align:right;color:var(--muted)">—</td>
                    </tr>
                `).join('');
        }

        document.getElementById('modal-historico-overlay').style.display = 'flex';

    } catch {
        alert('Erro ao carregar detalhes da votação.');
    }
}

function fecharModalHistorico() {
    document.getElementById('modal-historico-overlay').style.display = 'none';
}

async function excluirVotacao(id, btn) {
    if (!confirm('Tem certeza que deseja excluir esta votação do histórico? Esta ação não pode ser desfeita.')) return;

    btn.disabled = true;
    btn.textContent = '...';

    try {
        await fetch(API + '/historico/' + id, { method: 'DELETE' });
        carregarHistorico();
    } catch {
        alert('Erro ao excluir votação.');
        btn.disabled = false;
        btn.textContent = 'Excluir';
    }
}

// Utilitário para evitar XSS
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}