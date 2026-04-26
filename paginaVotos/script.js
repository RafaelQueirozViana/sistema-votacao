const API = 'http://localhost:3000';

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────

let _stream     = null;   // MediaStream ativo
let _fotoBase64 = null;   // Foto capturada, pronta para envio futuro

let _estadoAnterior = { aberta: null, iniciada: null };
let _pollingTimer   = null;
const POLLING_INTERVAL = 5000;

// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────

window.addEventListener('load', async () => {
    iniciarPolling();

    try {
        const res    = await fetch(API + '/status');
        const status = await res.json();

        _estadoAnterior.aberta   = status.aberta;
        _estadoAnterior.iniciada = status.iniciada;

        if (status.aberta) {
            // Votação aberta → fluxo normal: câmera primeiro
            await carregarCandidatos();
            iniciarCamera();
        } else {
            // Sem votação ativa → vai direto para o card com mensagem, sem câmera
            const msg = status.iniciada
                ? 'A votação foi encerrada.'
                : 'A votação ainda não foi iniciada.';
            mostrarMensagemSemCamera(msg);
        }
    } catch {
        mostrarMensagemSemCamera('Não foi possível conectar ao servidor.');
    }
});

// ─────────────────────────────────────────────
// CÂMERA
// ─────────────────────────────────────────────

async function iniciarCamera() {
    const instrucao = document.getElementById('camera-instrucao');
    const btnFoto   = document.getElementById('btn-foto');
    const erroEl    = document.getElementById('camera-erro');
    const liveEl    = document.getElementById('camera-live');
    const video     = document.getElementById('video');

    // Remove qualquer stream anterior antes de abrir um novo
    if (_stream) {
        _stream.getTracks().forEach(t => t.stop());
        _stream = null;
    }

    // Remove listener anterior para não acumular callbacks
    const novoVideo = video.cloneNode(true);
    video.parentNode.replaceChild(novoVideo, video);

    try {
        _stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });

        novoVideo.srcObject = _stream;

        novoVideo.addEventListener('loadedmetadata', () => {
            instrucao.textContent = 'Câmera pronta. Posicione seu rosto e capture.';
            btnFoto.disabled = false;
            btnFoto.classList.add('pronto');
        });

    } catch (err) {
        liveEl.style.display  = 'none';
        erroEl.style.display  = 'flex';
        console.warn('Câmera indisponível:', err);
    }
}

function pararCamera() {
    if (_stream) {
        _stream.getTracks().forEach(t => t.stop());
        _stream = null;
    }
}

function tentarNovamente() {
    document.getElementById('camera-erro').style.display = 'none';
    document.getElementById('camera-live').style.display = 'flex';
    iniciarCamera();
}

function tirarFoto() {
    const video  = document.getElementById('video');
    const canvas = document.getElementById('canvas');

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    _fotoBase64 = canvas.toDataURL('image/jpeg', 0.85);

    document.getElementById('camera-live').style.display    = 'none';
    document.getElementById('camera-preview').style.display = 'flex';
}

function refazerFoto() {
    _fotoBase64 = null;
    document.getElementById('camera-preview').style.display = 'none';
    document.getElementById('camera-live').style.display    = 'flex';
}

async function confirmarFoto() {
    document.getElementById('foto-thumb').src = _fotoBase64;

    pararCamera();

    const telaCamera     = document.getElementById('tela-camera');
    const telaFormulario = document.getElementById('tela-formulario');

    telaCamera.classList.add('saindo');

    setTimeout(() => {
        telaCamera.style.display     = 'none';
        telaFormulario.style.display = 'flex';
        telaFormulario.classList.add('entrando');
        setTimeout(() => telaFormulario.classList.remove('entrando'), 400);
    }, 280);

    // Carrega candidatos diretamente — não chama sincronizarFormulario
    // para não acionar o reset de câmera que o polling usaria
    await carregarCandidatos();
    mostrarFormulario();
}

function voltarCamera() {
    _fotoBase64 = null;

    const telaCamera     = document.getElementById('tela-camera');
    const telaFormulario = document.getElementById('tela-formulario');

    telaFormulario.style.display = 'none';
    telaCamera.style.display     = 'flex';
    telaCamera.classList.remove('saindo');

    document.getElementById('camera-preview').style.display = 'none';
    document.getElementById('camera-live').style.display    = 'flex';

    const btnFoto = document.getElementById('btn-foto');
    btnFoto.disabled = true;
    btnFoto.classList.remove('pronto');
    document.getElementById('camera-instrucao').textContent = 'Aguardando câmera…';

    iniciarCamera();
}

// ─────────────────────────────────────────────
// POLLING DE STATUS
// ─────────────────────────────────────────────

function iniciarPolling() {
    pararPolling();
    _pollingTimer = setInterval(verificarMudancas, POLLING_INTERVAL);
}

function pararPolling() {
    if (_pollingTimer) { clearInterval(_pollingTimer); _pollingTimer = null; }
}

async function verificarMudancas() {
    try {
        const res    = await fetch(API + '/status');
        const status = await res.json();

        const abertaMudou   = status.aberta   !== _estadoAnterior.aberta;
        const iniciadaMudou = status.iniciada !== _estadoAnterior.iniciada;

        if (abertaMudou || iniciadaMudou) await sincronizarFormulario(status);
    } catch { /* servidor indisponível — ignora */ }
}

// ─────────────────────────────────────────────
// SINCRONIZAÇÃO DO FORMULÁRIO
// ─────────────────────────────────────────────

// Pula a câmera e exibe a mensagem diretamente no card do formulário
function mostrarMensagemSemCamera() {
    pararCamera();
    document.getElementById('tela-camera').style.display     = 'none';
    document.querySelector('.foto-thumb-wrap').style.display  = 'none';
    document.getElementById('tela-formulario').style.display  = 'flex';
    mostrarMensagem(arguments[0]);
}

async function sincronizarFormulario(status = null) {
    try {
        if (!status) {
            const res = await fetch(API + '/status');
            status = await res.json();
        }

        _estadoAnterior.aberta   = status.aberta;
        _estadoAnterior.iniciada = status.iniciada;

        if (status.aberta) {
            await carregarCandidatos();

            // Votação abriu (ou reabriu) — sempre reinicia pelo fluxo da câmera
            // independente de qual tela estiver visível no momento
            _fotoBase64 = null;
            document.getElementById('tela-formulario').style.display = 'none';
            document.getElementById('tela-sucesso').style.display    = 'none';
            document.querySelector('.foto-thumb-wrap').style.display  = '';

            const telaCamera = document.getElementById('tela-camera');
            telaCamera.classList.remove('saindo', 'entrando');
            document.getElementById('camera-preview').style.display = 'none';
            document.getElementById('camera-live').style.display    = 'flex';
            const btnFoto = document.getElementById('btn-foto');
            btnFoto.disabled = true;
            btnFoto.classList.remove('pronto');
            document.getElementById('camera-instrucao').textContent = 'Aguardando câmera…';
            telaCamera.style.display = 'flex';

            iniciarCamera();
        } else {
            const msg = status.iniciada
                ? 'A votação foi encerrada.'
                : 'A votação ainda não foi iniciada.';

            // Se a votação fechar enquanto o usuário ainda está na câmera
            if (document.getElementById('tela-camera').style.display !== 'none') {
                mostrarMensagemSemCamera(msg);
            } else {
                mostrarMensagem(msg);
            }
        }
    } catch {
        mostrarMensagem('Não foi possível conectar ao servidor.');
    }
}

// ─────────────────────────────────────────────
// UI DO FORMULÁRIO
// ─────────────────────────────────────────────

function mostrarFormulario() {
    document.getElementById('mainForm').style.display        = 'block';
    document.getElementById('msg-votacao').style.display     = 'none';
    document.getElementById('re-funcionario').value          = '';
    document.getElementById('senha').value                   = '';
    document.getElementById('voto-input').value              = '';
}

function mostrarMensagem(texto) {
    document.getElementById('mainForm').style.display    = 'none';
    const msg = document.getElementById('msg-votacao');
    msg.textContent  = texto;
    msg.style.display = 'block';
}

// ─────────────────────────────────────────────
// CANDIDATOS
// ─────────────────────────────────────────────

async function carregarCandidatos() {
    try {
        const [resCandidatos, resInfo] = await Promise.all([
            fetch(API + '/candidatos'),
            fetch(API + '/votacao-info')
        ]);

        const candidatos = await resCandidatos.json();
        const info       = await resInfo.json();

        // Atualiza título dinâmico
        const tituloEl = document.getElementById('titulo-votacao');
        if (tituloEl && info && info.nome) tituloEl.textContent = info.nome;

        const select = document.getElementById('voto-input');
        while (select.options.length > 1) select.remove(1);

        candidatos.forEach(item => {
            const opt       = document.createElement('option');
            opt.value       = item.nome.toLowerCase();
            opt.textContent = item.nome;
            select.appendChild(opt);
        });
    } catch { }
}

// ─────────────────────────────────────────────
// REGISTRAR VOTO
// _fotoBase64 já está disponível para ser incluída
// no payload quando o backend for atualizado:
//   body: JSON.stringify({ idFuncionario, candidato, senha, foto: _fotoBase64 })
// ─────────────────────────────────────────────

async function votar() {
    const idFuncionario = document.getElementById('re-funcionario').value.trim();
    const senha         = document.getElementById('senha').value.trim();
    const candidato     = document.getElementById('voto-input').value;

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
            mostrarTelaSucesso();
        } else {
            mostrarPopup(data.mensagem, 'erro');
        }
    } catch {
        mostrarPopup('Erro de conexão com o servidor.', 'erro');
    }
}

function mostrarTelaSucesso() {
    const telaFormulario = document.getElementById('tela-formulario');
    const telaSucesso    = document.getElementById('tela-sucesso');

    telaFormulario.classList.add('saindo');
    setTimeout(() => {
        telaFormulario.style.display = 'none';
        telaFormulario.classList.remove('saindo');
        telaSucesso.style.display = 'flex';
        telaSucesso.classList.add('entrando');
        setTimeout(() => telaSucesso.classList.remove('entrando'), 400);
    }, 280);
}

function voltarParaFormulario() {
    _fotoBase64 = null;
    document.getElementById('re-funcionario').value = '';
    document.getElementById('senha').value          = '';
    document.getElementById('voto-input').value     = '';

    const telaSucesso = document.getElementById('tela-sucesso');
    const telaCamera  = document.getElementById('tela-camera');

    // Esconde sucesso sem animação para evitar conflito com entrando da câmera
    telaSucesso.style.display = 'none';

    // Garante que não há classes de animação residuais na tela de câmera
    telaCamera.classList.remove('saindo', 'entrando');

    // Reseta UI interna da câmera
    document.getElementById('camera-preview').style.display = 'none';
    document.getElementById('camera-live').style.display    = 'flex';
    const btnFoto = document.getElementById('btn-foto');
    btnFoto.disabled = true;
    btnFoto.classList.remove('pronto');
    document.getElementById('camera-instrucao').textContent = 'Aguardando câmera…';

    // Mostra tela de câmera e inicia stream
    telaCamera.style.display = 'flex';
    iniciarCamera();
}

// ─────────────────────────────────────────────
// POPUP
// ─────────────────────────────────────────────

function mostrarPopup(mensagem, tipo = 'sucesso') {
    const popup = document.getElementById('popup');
    popup.className = 'popup ' + tipo;
    document.getElementById('popup-icone').textContent = tipo === 'sucesso' ? '✓' : '✕';
    document.getElementById('popup-texto').textContent = mensagem;
    popup.style.display = 'flex';
    setTimeout(fecharPopup, 3500);
}

function fecharPopup() {
    document.getElementById('popup').style.display = 'none';
}