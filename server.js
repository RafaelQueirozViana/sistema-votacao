const express = require('express');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const cors = require('cors');

const app = express();

app.use(express.json());
app.use(cors());

const RE_VALIDOS = ['11111', '22222', '33333', '44444'];

// ─────────────────────────────────────────────
// MIDDLEWARE: bloqueia a página de resultado se votação não iniciada
// ─────────────────────────────────────────────

app.use('/paginaResult', async (req, res, next) => {
    if (!db) return next();
    try {
        const status = await getStatus();
        if (!status.iniciada) {
            return res.status(403).send(`
                <html><body style="font-family:sans-serif;display:flex;align-items:center;
                justify-content:center;height:100vh;margin:0;background:#FAFAF8">
                <div style="text-align:center;color:#A0A09A">
                    <p style="font-size:1.1rem;margin-bottom:8px">Resultado indisponível</p>
                    <p style="font-size:0.82rem">A votação ainda não foi iniciada.</p>
                </div></body></html>
            `);
        }
        next();
    } catch { next(); }
});

app.use(express.static(__dirname));

app.get('/', (req, res) => res.redirect('/paginaVotos/formulario.html'));
app.get('/gestao', (req, res) => res.redirect('/paginaGestao/gestao.html'));

// ─────────────────────────────────────────────
// BANCO DE DADOS
// ─────────────────────────────────────────────

let db;

async function initDatabase() {
    db = await open({ filename: './votos.db', driver: sqlite3.Database });

    // Tabela de votos da votação atual
    await db.exec(`
        CREATE TABLE IF NOT EXISTS votos (
            idFuncionario TEXT,
            candidato     TEXT,
            dataHora      TEXT
        )
    `);

    // Tabela de controle de estado
    await db.exec(`
        CREATE TABLE IF NOT EXISTS controle (
            id       INTEGER PRIMARY KEY,
            iniciada INTEGER DEFAULT 0,
            aberta   INTEGER DEFAULT 0
        )
    `);

    // Candidatos da votação atual
    await db.exec(`
        CREATE TABLE IF NOT EXISTS candidatos (
            nome TEXT UNIQUE
        )
    `);

    // Metadados da votação atual
    await db.exec(`
        CREATE TABLE IF NOT EXISTS votacao_info (
            id          INTEGER PRIMARY KEY,
            nome        TEXT DEFAULT '',
            descricao   TEXT DEFAULT '',
            dataCriacao TEXT DEFAULT ''
        )
    `);

    // Histórico: uma linha por votação encerrada
    await db.exec(`
        CREATE TABLE IF NOT EXISTS historico (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            nome              TEXT DEFAULT '',
            descricao         TEXT DEFAULT '',
            dataCriacao       TEXT DEFAULT '',
            dataEncerramento  TEXT DEFAULT '',
            votos             TEXT DEFAULT '[]'
        )
    `);

    await db.run(`INSERT OR IGNORE INTO controle (id, iniciada, aberta) VALUES (1, 0, 0)`);
    await db.run(`INSERT OR IGNORE INTO votacao_info (id, nome, descricao, dataCriacao) VALUES (1, '', '', '')`);

    // Migração: adiciona coluna se banco antigo não tiver
    try {
        await db.run(`ALTER TABLE historico ADD COLUMN dataEncerramento TEXT DEFAULT ''`);
    } catch { /* coluna já existe */ };

    app.listen(3000, '0.0.0.0', () => {
        console.log('Servidor rodando em http://localhost:3000');
    });
}

async function getStatus() {
    return await db.get('SELECT iniciada, aberta FROM controle WHERE id = 1');
}

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

const GESTOR_USER = 'admin';
const GESTOR_PASS = 'admin';

app.post('/login', (req, res) => {
    const { usuario, senha } = req.body;
    if (usuario === GESTOR_USER && senha === GESTOR_PASS) return res.json({ ok: true });
    res.status(401).json({ ok: false, mensagem: 'Usuário ou senha incorretos.' });
});

// ─────────────────────────────────────────────
// STATUS E CONTROLE
// ─────────────────────────────────────────────

app.get('/status', async (req, res) => {
    const s = await getStatus();
    res.json({ iniciada: !!s.iniciada, aberta: !!s.aberta });
});

app.post('/iniciar', async (req, res) => {
    await db.run('UPDATE controle SET iniciada = 1, aberta = 1 WHERE id = 1');
    res.json({ mensagem: 'Votação iniciada!' });
});

app.post('/encerrar', async (req, res) => {
    await db.run('UPDATE controle SET aberta = 0 WHERE id = 1');
    res.json({ mensagem: 'Votação encerrada!' });
});

// ─────────────────────────────────────────────
// METADADOS DA VOTAÇÃO ATUAL
// ─────────────────────────────────────────────

app.post('/votacao-info', async (req, res) => {
    const { nome, descricao } = req.body;
    const dataCriacao = new Date().toISOString();
    await db.run(
        'UPDATE votacao_info SET nome = ?, descricao = ?, dataCriacao = ? WHERE id = 1',
        [nome || '', descricao || '', dataCriacao]
    );
    res.json({ mensagem: 'Info salva!' });
});

// ─────────────────────────────────────────────
// CANDIDATOS
// ─────────────────────────────────────────────

app.post('/candidatos', async (req, res) => {
    const { candidatos } = req.body;
    if (!candidatos || candidatos.length === 0) return res.status(400).json({ erro: 'Nenhum candidato informado.' });

    await db.run('DELETE FROM candidatos');
    for (const nome of candidatos) {
        await db.run('INSERT OR IGNORE INTO candidatos (nome) VALUES (?)', [nome.trim()]);
    }
    await db.run(`INSERT OR IGNORE INTO candidatos (nome) VALUES ('Branco')`);
    await db.run(`INSERT OR IGNORE INTO candidatos (nome) VALUES ('Nulo')`);

    res.json({ mensagem: 'Candidatos salvos!' });
});

app.get('/candidatos', async (req, res) => {
    const candidatos = await db.all('SELECT nome FROM candidatos');
    res.json(candidatos);
});

// ─────────────────────────────────────────────
// VOTOS
// ─────────────────────────────────────────────

app.post('/votar', async (req, res) => {
    const { idFuncionario, candidato } = req.body;

    if (!idFuncionario || !candidato) return res.json({ mensagem: 'Preencha todos os campos.' });
    if (!RE_VALIDOS.includes(String(idFuncionario).trim())) return res.json({ mensagem: 'RE não autorizado. Verifique seu número de registro.' });

    const status = await getStatus();
    if (!status.aberta) return res.json({ mensagem: 'A votação não está aberta no momento.' });

    const jaVotou = await db.get('SELECT * FROM votos WHERE idFuncionario = ?', [idFuncionario]);
    if (jaVotou) return res.json({ mensagem: 'Você já votou!' });

    const dataHora = new Date().toISOString();
    await db.run('INSERT INTO votos (idFuncionario, candidato, dataHora) VALUES (?, ?, ?)', [idFuncionario, candidato, dataHora]);
    res.json({ mensagem: 'Voto registrado com sucesso!' });
});

app.get('/resultado', async (req, res) => {
    const resultado = await db.all('SELECT candidato, COUNT(*) as total FROM votos GROUP BY candidato');
    res.json(resultado);
});

app.get('/votantes', async (req, res) => {
    const votantes = await db.all('SELECT idFuncionario FROM votos');
    res.json(votantes);
});

app.get('/relatorio', async (req, res) => {
    const relatorio = await db.all('SELECT idFuncionario, dataHora FROM votos ORDER BY dataHora ASC');
    res.json(relatorio);
});

// ─────────────────────────────────────────────
// ARQUIVAR → salva votação atual no histórico
// ─────────────────────────────────────────────

app.post('/arquivar', async (req, res) => {
    try {
        const info = await db.get('SELECT nome, descricao, dataCriacao FROM votacao_info WHERE id = 1');

        // Só arquiva se havia uma votação com nome preenchido
        if (!info || !info.nome) return res.json({ mensagem: 'Nada para arquivar.' });

        // Agrega os votos atuais
        const votos = await db.all('SELECT candidato, COUNT(*) as total FROM votos GROUP BY candidato');
        const dataEncerramento = new Date().toISOString();

        await db.run(
            'INSERT INTO historico (nome, descricao, dataCriacao, dataEncerramento, votos) VALUES (?, ?, ?, ?, ?)',
            [info.nome, info.descricao || '', info.dataCriacao || dataEncerramento, dataEncerramento, JSON.stringify(votos)]
        );

        res.json({ mensagem: 'Votação arquivada!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao arquivar.' });
    }
});

// ─────────────────────────────────────────────
// HISTÓRICO — listagem e detalhe
// ─────────────────────────────────────────────

// Lista todas as votações arquivadas (mais recentes primeiro)
app.get('/historico', async (req, res) => {
    const rows = await db.all('SELECT id, nome, descricao, dataCriacao FROM historico ORDER BY id DESC');
    res.json(rows);
});

// Detalhe de uma votação específica
app.get('/historico/:id', async (req, res) => {
    const row = await db.get('SELECT * FROM historico WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ erro: 'Não encontrado.' });
    row.votos = JSON.parse(row.votos || '[]');
    res.json(row);
});

// Excluir uma votação do histórico
app.delete('/historico/:id', async (req, res) => {
    await db.run('DELETE FROM historico WHERE id = ?', [req.params.id]);
    res.json({ mensagem: 'Excluído!' });
});

// ─────────────────────────────────────────────
// RESET
// ─────────────────────────────────────────────

app.delete('/resetar', async (req, res) => {
    await db.run('DELETE FROM votos');
    await db.run('DELETE FROM candidatos');
    await db.run('UPDATE controle SET iniciada = 0, aberta = 0 WHERE id = 1');
    await db.run(`UPDATE votacao_info SET nome = '', descricao = '', dataCriacao = '' WHERE id = 1`);
    res.json({ mensagem: 'Votação resetada com sucesso!' });
});

// ─────────────────────────────────────────────


initDatabase();

// Analise e interprete esse meu projeto. É um sistema de votação que tem a pagina de formulario e a pagina de votação, onde pela pagina de gestao é possivel criar uma nova votação. Existem varios sistemas envolvendo esse projeto, analise e interprete eles (utilizei uma imagem mostrando a estrutura das pastas do projeto). Depois que voce interpretar Vou solicitar para você fazer mudanças e alterações