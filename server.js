const express = require('express');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const cors = require('cors');

const app = express();

app.use(express.json());
app.use(cors());

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
            dataHora      TEXT,
            foto          TEXT
        )
    `);

    // Migração: adiciona coluna foto se banco já existia sem ela
    try {
        await db.run(`ALTER TABLE votos ADD COLUMN foto TEXT`);
    } catch { /* coluna já existe */ }

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

    // ── NOVO: Tabela de funcionários cadastrados ──
    await db.exec(`
        CREATE TABLE IF NOT EXISTS funcionarios (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nome            TEXT NOT NULL,
            re              TEXT NOT NULL UNIQUE,
            dataNascimento  TEXT NOT NULL
        )
    `);

    await db.run(`INSERT OR IGNORE INTO controle (id, iniciada, aberta) VALUES (1, 0, 0)`);
    await db.run(`INSERT OR IGNORE INTO votacao_info (id, nome, descricao, dataCriacao) VALUES (1, '', '', '')`);

    // Migração: adiciona coluna se banco antigo não tiver
    try {
        await db.run(`ALTER TABLE historico ADD COLUMN dataEncerramento TEXT DEFAULT ''`);
    } catch { /* coluna já existe */ }

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
// FUNCIONÁRIOS
// ─────────────────────────────────────────────

// Listar todos os funcionários
app.get('/funcionarios', async (req, res) => {
    try {
        const rows = await db.all('SELECT id, nome, re, dataNascimento FROM funcionarios ORDER BY nome ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao listar funcionários.' });
    }
});

// Cadastrar funcionário
app.post('/funcionarios', async (req, res) => {
    const { nome, re, dataNascimento } = req.body;

    if (!nome || !re || !dataNascimento) {
        return res.status(400).json({ ok: false, mensagem: 'Preencha todos os campos.' });
    }

    // RE deve ser numérico
    if (!/^\d+$/.test(re.trim())) {
        return res.status(400).json({ ok: false, mensagem: 'O RE deve conter apenas números.' });
    }

    // dataNascimento deve ser 8 dígitos numéricos (DDMMAAAA)
    if (!/^\d{8}$/.test(dataNascimento.trim())) {
        return res.status(400).json({ ok: false, mensagem: 'Data de nascimento inválida. Use o formato DDMMAAAA.' });
    }

    try {
        await db.run(
            'INSERT INTO funcionarios (nome, re, dataNascimento) VALUES (?, ?, ?)',
            [nome.trim(), re.trim(), dataNascimento.trim()]
        );
        res.json({ ok: true, mensagem: 'Funcionário cadastrado com sucesso!' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ ok: false, mensagem: 'Já existe um funcionário com este RE.' });
        }
        res.status(500).json({ ok: false, mensagem: 'Erro ao cadastrar funcionário.' });
    }
});

// Excluir funcionário
app.delete('/funcionarios/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM funcionarios WHERE id = ?', [req.params.id]);
        res.json({ ok: true, mensagem: 'Funcionário removido.' });
    } catch {
        res.status(500).json({ ok: false, mensagem: 'Erro ao remover funcionário.' });
    }
});

// ─────────────────────────────────────────────
// VOTOS  ← agora valida contra tabela funcionarios
// ─────────────────────────────────────────────

app.post('/votar', async (req, res) => {
    const { idFuncionario, candidato, senha, foto } = req.body;

    if (!idFuncionario || !candidato) {
        return res.json({ mensagem: 'Preencha todos os campos.' });
    }

    const status = await getStatus();
    if (!status.aberta) {
        return res.json({ mensagem: 'A votação não está aberta no momento.' });
    }

    const funcionario = await db.get(
        'SELECT * FROM funcionarios WHERE re = ?',
        [String(idFuncionario).trim()]
    );

    if (!funcionario) {
        return res.json({ mensagem: 'RE não autorizado. Verifique seu número de registro.' });
    }

    const senhaDigitada = String(senha || '').replace(/\D/g, '');
    if (senhaDigitada !== funcionario.dataNascimento) {
        return res.json({ mensagem: 'Senha incorreta. Use sua data de nascimento (apenas números).' });
    }

    const jaVotou = await db.get('SELECT * FROM votos WHERE idFuncionario = ?', [idFuncionario]);
    if (jaVotou) {
        return res.json({ mensagem: 'Você já votou!' });
    }

    const dataHora = new Date().toISOString();
    await db.run(
        'INSERT INTO votos (idFuncionario, candidato, dataHora, foto) VALUES (?, ?, ?, ?)',
        [idFuncionario, candidato, dataHora, foto || null]
    );
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
    const relatorio = await db.all(`
        SELECT v.idFuncionario, v.dataHora, v.foto, f.nome
        FROM votos v
        LEFT JOIN funcionarios f ON f.re = v.idFuncionario
        ORDER BY v.dataHora ASC
    `);
    res.json(relatorio);
});

app.get('/votacao-info', async (req, res) => {
    const info = await db.get('SELECT nome, descricao, dataCriacao FROM votacao_info WHERE id = 1');
    res.json(info || { nome: '', descricao: '', dataCriacao: '' });
});

// ─────────────────────────────────────────────
// ARQUIVAR → salva votação atual no histórico
// ─────────────────────────────────────────────

app.post('/arquivar', async (req, res) => {
    try {
        const info = await db.get('SELECT nome, descricao, dataCriacao FROM votacao_info WHERE id = 1');

        if (!info || !info.nome) return res.json({ mensagem: 'Nada para arquivar.' });

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
// HISTÓRICO
// ─────────────────────────────────────────────

app.get('/historico', async (req, res) => {
    const rows = await db.all('SELECT id, nome, descricao, dataCriacao FROM historico ORDER BY id DESC');
    res.json(rows);
});

app.get('/historico/:id', async (req, res) => {
    const row = await db.get('SELECT * FROM historico WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ erro: 'Não encontrado.' });
    row.votos = JSON.parse(row.votos || '[]');
    res.json(row);
});

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