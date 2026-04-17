const API = 'http://localhost:3000';

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────

window.addEventListener('load', async () => {
    await verificarStatus();
    await carregarCandidatos();
});

// ─────────────────────────────────────────────
// VERIFICAR STATUS DA VOTAÇÃO
// ─────────────────────────────────────────────

async function verificarStatus() {
    try {
        const res = await fetch(API + '/status');
        const status = await res.json();

        if (!status.aberta) {
            document.getElementById('mainForm').style.display = 'none';
            document.getElementById('msg-votacao').style.display = 'block';
            document.getElementById('msg-votacao').textContent = status.iniciada
                ? 'A votação foi encerrada.'
                : 'A votação ainda não foi iniciada.';
        }
    } catch { }
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
// REGISTRAR VOTO
// ─────────────────────────────────────────────

async function votar() {
    const idFuncionario = document.getElementById('re-funcionario').value.trim();
    const candidato = document.getElementById('voto-input').value;

    if (!idFuncionario || !candidato) {
        mostrarPopup('Preencha o RE e selecione um candidato.', 'erro');
        return;
    }

    const res = await fetch(API + '/votar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idFuncionario, candidato })
    });

    const data = await res.json();

    // Voto registrado com sucesso — limpa os campos e mostra confirmação
    if (data.mensagem === 'Voto registrado com sucesso!') {
        document.getElementById('re-funcionario').value = '';
        document.getElementById('senha').value = '';
        document.getElementById('voto-input').value = '';
        mostrarPopup(data.mensagem, 'sucesso');
    } else {
        // Qualquer outra resposta (já votou, votação fechada...) — popup de aviso
        mostrarPopup(data.mensagem, 'erro');
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

    // Fecha automaticamente após 3 segundos
    setTimeout(() => fecharPopup(), 3000);
}

function fecharPopup() {
    document.getElementById('popup').style.display = 'none';
}