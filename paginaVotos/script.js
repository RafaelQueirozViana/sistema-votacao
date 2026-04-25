const API = 'http://localhost:3000';

// ─────────────────────────────────────────────
// ESTADO LOCAL — rastreia o que a página já sabe
// ─────────────────────────────────────────────

let _estadoAnterior = {
    aberta: null,
    iniciada: null,
};

let _pollingTimer = null;
const POLLING_INTERVAL = 5000;

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────

window.addEventListener('load', async () => {
    await sincronizarPagina();
    iniciarPolling();
});

// ─────────────────────────────────────────────
// POLLING
// ─────────────────────────────────────────────

function iniciarPolling() {
    pararPolling();
    _pollingTimer = setInterval(verificarMudancas, POLLING_INTERVAL);
}

function pararPolling() {
    if (_pollingTimer) {
        clearInterval(_pollingTimer);
        _pollingTimer = null;
    }
}

// ─────────────────────────────────────────────
// VERIFICAÇÃO DE MUDANÇAS (chamada pelo polling)
// ─────────────────────────────────────────────

async function verificarMudancas() {
    try {
        const res = await fetch(API + '/status');
        const status = await res.json();

        const abertaMudou = status.aberta !== _estadoAnterior.aberta;
        const iniciadaMudou = status.iniciada !== _estadoAnterior.iniciada;

        if (abertaMudou || iniciadaMudou) {
            await sincronizarPagina(status);
        }

    } catch {
        // Servidor indisponível — ignora silenciosamente
    }
}

// ─────────────────────────────────────────────
// SINCRONIZAÇÃO COMPLETA DA PÁGINA
// ─────────────────────────────────────────────

async function sincronizarPagina(status = null) {
    try {
        if (!status) {
            const res = await fetch(API + '/status');
            status = await res.json();
        }

        _estadoAnterior.aberta = status.aberta;
        _estadoAnterior.iniciada = status.iniciada;

        if (status.aberta) {
            await carregarCandidatos();
            mostrarFormulario();
        } else {
            const mensagem = status.iniciada
                ? 'A votação foi encerrada.'
                : 'A votação ainda não foi iniciada.';
            mostrarMensagem(mensagem);
        }

    } catch {
        mostrarMensagem('Não foi possível conectar ao servidor.');
    }
}

// ─────────────────────────────────────────────
// HELPERS DE UI
// ─────────────────────────────────────────────

function mostrarFormulario() {
    document.getElementById('mainForm').style.display = 'block';
    document.getElementById('msg-votacao').style.display = 'none';
    document.getElementById('re-funcionario').value = '';
    document.getElementById('senha').value = '';
    document.getElementById('voto-input').value = '';
}

function mostrarMensagem(texto) {
    document.getElementById('mainForm').style.display = 'none';
    const msg = document.getElementById('msg-votacao');
    msg.textContent = texto;
    msg.style.display = 'block';
}

// ─────────────────────────────────────────────
// CARREGAR CANDIDATOS NO <SELECT>
// ─────────────────────────────────────────────

async function carregarCandidatos() {
    try {
        const res = await fetch(API + '/candidatos');
        const data = await res.json();

        const select = document.getElementById('voto-input');

        while (select.options.length > 1) {
            select.remove(1);
        }

        data.forEach(item => {
            const option = document.createElement('option');
            option.value = item.nome.toLowerCase();
            option.textContent = item.nome;
            select.appendChild(option);
        });

    } catch { }
}

// ─────────────────────────────────────────────
// REGISTRAR VOTO  ← agora envia a senha
// ─────────────────────────────────────────────

async function votar() {
    const idFuncionario = document.getElementById('re-funcionario').value.trim();
    const senha = document.getElementById('senha').value.trim();
    const candidato = document.getElementById('voto-input').value;

    if (!idFuncionario || !senha || !candidato) {
        mostrarPopup('Preencha todos os campos antes de votar.', 'erro');
        return;
    }

    try {
        const res = await fetch(API + '/votar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idFuncionario, candidato, senha })
        });

        const data = await res.json();

        if (data.mensagem === 'Voto registrado com sucesso!') {
            document.getElementById('re-funcionario').value = '';
            document.getElementById('senha').value = '';
            document.getElementById('voto-input').value = '';
            mostrarPopup(data.mensagem, 'sucesso');
        } else {
            mostrarPopup(data.mensagem, 'erro');
        }
    } catch {
        mostrarPopup('Erro de conexão com o servidor.', 'erro');
    }
}

// ─────────────────────────────────────────────
// POPUP
// ─────────────────────────────────────────────

function mostrarPopup(mensagem, tipo = 'sucesso') {
    const popup = document.getElementById('popup');
    const texto = document.getElementById('popup-texto');

    texto.textContent = mensagem;
    popup.className = 'popup ' + tipo;
    document.getElementById('popup-icone').textContent = tipo === 'sucesso' ? '✓' : '✕';
    popup.style.display = 'flex';

    setTimeout(() => fecharPopup(), 3500);
}

function fecharPopup() {
    document.getElementById('popup').style.display = 'none';
}