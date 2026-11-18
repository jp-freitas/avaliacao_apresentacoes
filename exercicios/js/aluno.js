// Página do aluno: entra com o código pessoal, testa as respostas e entrega
import {
  db, esc, formatarData, toast, confirmar, normCode,
  prepararEditor, executarConsulta, estruturaBanco, htmlResultado, htmlEstrutura,
  ABAS, NOME_ABA, codigoCompleto, renderPreview,
} from "./common.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const exId = new URLSearchParams(location.search).get("ex");
const app = document.getElementById("app");
const CHAVE_LOCAL = "exercicios-codigo";

let aluno = null;         // { codigo, nome }
let exercicio = null;
let anterior = null;      // entrega já salva (se houver)
let estado = [];          // por questão: { tipo, codigo:{...}, testado: string|null, erro, aba }
let salvo = [];           // para avisar ao sair sem enviar

const chave = (s) => JSON.stringify(s.codigo);

// ---------- Entrada ----------
iniciar();

async function iniciar() {
  if (!exId) {
    return mensagem("Link incompleto",
      '<p>Abra o link do exercício que o professor enviou.</p><p class="meta">Professor? <a href="professor.html">Acesse o painel</a>.</p>');
  }
  let guardado = null;
  try { guardado = localStorage.getItem(CHAVE_LOCAL) || localStorage.getItem("aval-codigo"); } catch { /* ignora */ }
  if (guardado) {
    try {
      const s = await getDoc(doc(db, "alunos", guardado));
      if (s.exists()) return entrarComo(guardado, s.data().nome || "");
    } catch { /* cai para a tela de código */ }
  }
  telaCodigo();
}

function mensagem(titulo, html) {
  app.innerHTML = `<section class="card centro"><h1>${esc(titulo)}</h1>${html}</section>`;
}

function renderTopo() {
  const el = document.getElementById("usuario");
  if (!aluno) { el.innerHTML = ""; return; }
  el.innerHTML = `<span class="nome-usuario">${esc(aluno.nome)}</span><button class="link" id="btn-trocar">Trocar código</button>`;
  document.getElementById("btn-trocar").onclick = () => {
    if (estado.some((s, i) => chave(s) !== salvo[i]) && !window.confirm("Você tem alterações não entregues. Sair mesmo assim?")) return;
    try { localStorage.removeItem(CHAVE_LOCAL); } catch { /* ignora */ }
    aluno = null; exercicio = null; estado = []; salvo = [];
    renderTopo(); telaCodigo();
  };
}

function telaCodigo() {
  app.innerHTML = `
    <section class="card centro login login-codigo">
      <h1>Entrega de exercício</h1>
      <p>Digite o código pessoal que o professor entregou para você.</p>
      <form id="form-codigo">
        <input id="f-codigo" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123">
        <button class="primario grande" id="btn-entrar">Entrar</button>
      </form>
      <p class="meta" id="msg-codigo"></p>
    </section>`;
  const f = document.getElementById("f-codigo");
  f.focus();
  document.getElementById("form-codigo").onsubmit = async (e) => {
    e.preventDefault();
    const code = normCode(f.value);
    const msg = document.getElementById("msg-codigo");
    if (code.length < 4) { msg.textContent = "Digite o código completo."; return; }
    msg.textContent = "Conferindo…";
    try {
      const s = await getDoc(doc(db, "alunos", code));
      if (!s.exists()) { msg.textContent = "Código não encontrado. Confira com o professor."; return; }
      try { localStorage.setItem(CHAVE_LOCAL, code); } catch { /* ignora */ }
      entrarComo(code, s.data().nome || "");
    } catch {
      msg.textContent = "Não foi possível conectar. Confira a internet e tente de novo.";
    }
  };
}

async function entrarComo(codigo, nome) {
  aluno = { codigo, nome };
  renderTopo();
  try {
    await carregar();
  } catch (e) {
    console.error(e);
    mensagem("Não foi possível carregar o exercício", `<p>${esc(e.message)}</p>`);
  }
}

window.addEventListener("beforeunload", (e) => {
  if (exercicio && estado.some((s, i) => chave(s) !== salvo[i])) e.preventDefault();
});

// ---------- Exercício ----------
async function carregar() {
  app.innerHTML = '<p class="carregando">Carregando exercício…</p>';
  const snap = await getDoc(doc(db, "exercicios", exId));
  if (!snap.exists()) return mensagem("Exercício não encontrado", "<p>Confira o link com o professor.</p>");
  exercicio = snap.data();

  const rs = await getDoc(doc(db, "exercicios", exId, "respostas", aluno.codigo));
  anterior = rs.exists() ? rs.data() : null;

  estado = exercicio.questoes.map((q, i) => {
    const r = anterior?.respostas?.[i];
    const tipo = q.tipo || "sql";
    let codigo;
    if (tipo === "sql") codigo = { sql: r?.codigo?.sql ?? "" };
    else {
      codigo = {};
      for (const a of ABAS) if (q.web?.[a]?.modo === "editavel") codigo[a] = r?.codigo?.[a] ?? (q.web[a].inicial || "");
    }
    const s = { tipo, codigo, testado: null, erro: !!r?.comErro, aba: null };
    if (r?.testado) s.testado = chave(s);
    if (tipo === "web") s.aba = ABAS.find((a) => q.web?.[a]?.modo === "editavel") || ABAS.find((a) => q.web?.[a]?.modo === "travado");
    return s;
  });
  salvo = estado.map(chave);
  render();
}

const aberto = () => exercicio.aberto !== false;
const temSql = () => exercicio.questoes.some((q) => (q.tipo || "sql") === "sql");

function emBranco(s, q) {
  if (s.tipo === "sql") return !s.codigo.sql.trim();
  return Object.keys(s.codigo).every((a) => !s.codigo[a].trim() || s.codigo[a] === (q.web[a].inicial || ""));
}

function htmlStatus() {
  if (!anterior) return "";
  let h = `<div class="sucesso">Você entregou em <strong>${formatarData(anterior.enviadoEm)}</strong>.
    ${aberto() ? " Você pode reenviar enquanto o exercício estiver aberto — vale a última entrega." : ""}</div>`;
  if (anterior.nota !== undefined && anterior.nota !== null) {
    h += `<div class="nota-box"><div>Nota: <strong>${esc(anterior.nota)}</strong></div>
      ${anterior.comentario ? `<div class="feedback-titulo">Feedback do professor</div><div class="texto">${esc(anterior.comentario)}</div>` : ""}</div>`;
  }
  return h;
}

function htmlQuestao(q, i) {
  const s = estado[i];
  const topo = `
    <div class="questao-topo"><h2>Questão ${i + 1}</h2><span class="badge" id="badge-${i}"></span></div>
    <div class="texto">${esc(q.enunciado)}</div>`;
  const botoes = `
    <div class="linha-botoes">
      <button class="secundario" data-executar="${i}">▶ Executar</button>
      <span class="dica">ou Ctrl + Enter</span>
    </div>`;

  if (s.tipo === "sql") {
    return `<section class="card questao">${topo}
      <textarea class="editor" id="ed-${i}" spellcheck="false" rows="7"
        placeholder="Escreva sua consulta SQL aqui…" ${aberto() ? "" : "readonly"}>${esc(s.codigo.sql)}</textarea>
      ${botoes}
      <div class="resultado-area" id="res-${i}"></div></section>`;
  }

  const visiveis = ABAS.filter((a) => q.web[a].modo !== "oculto");
  return `<section class="card questao">${topo}
    <div class="web-grade">
      <div>
        <div class="abas">${visiveis.map((a) => `
          <button class="aba ${a === s.aba ? "ativa" : ""}" data-q="${i}" data-aba="${a}">
            ${NOME_ABA[a]}${q.web[a].modo === "travado" ? " 🔒" : ""}</button>`).join("")}</div>
        <textarea class="editor" id="ed-${i}" spellcheck="false" rows="14"></textarea>
        ${botoes}
      </div>
      <div id="res-${i}"><div class="placeholder-preview">Clique em <strong>▶ Executar</strong> para ver sua página aqui.</div></div>
    </div></section>`;
}

function render() {
  app.innerHTML = `
    <section class="card">
      <h1>${esc(exercicio.titulo)}</h1>
      ${exercicio.descricao ? `<div class="texto">${esc(exercicio.descricao)}</div>` : ""}
      <div id="status">${htmlStatus()}</div>
      ${aberto() ? "" : '<div class="alerta">Este exercício está encerrado. Você ainda pode testar, mas não pode mais entregar.</div>'}
    </section>

    ${temSql() ? `
    <section class="card">
      <details open>
        <summary><h2>Banco de dados do exercício</h2></summary>
        <p class="dica">O banco é recriado do zero a cada execução, então teste à vontade — nada que você rodar estraga os dados.</p>
        <div id="estrutura"><p class="carregando">Montando o banco…</p></div>
        <div id="preview"></div>
      </details>
    </section>` : ""}

    ${exercicio.questoes.map(htmlQuestao).join("")}

    ${aberto() ? `<div class="acoes-finais">
      <button class="primario grande" id="btn-enviar">${anterior ? "Reenviar exercício" : "Entregar exercício"}</button>
    </div>` : ""}`;

  exercicio.questoes.forEach((q, i) => {
    const ta = document.getElementById(`ed-${i}`);
    prepararEditor(ta, () => executar(i));
    ta.addEventListener("input", () => {
      const s = estado[i];
      if (s.tipo === "sql") s.codigo.sql = ta.value;
      else if (q.web[s.aba].modo === "editavel") s.codigo[s.aba] = ta.value;
      atualizarBadge(i);
    });
    if (estado[i].tipo === "web") mostrarAba(i, estado[i].aba);
    atualizarBadge(i);
  });
  app.querySelectorAll("[data-aba]").forEach((b) => (b.onclick = () => mostrarAba(+b.dataset.q, b.dataset.aba)));
  app.querySelectorAll("[data-executar]").forEach((b) => (b.onclick = () => executar(+b.dataset.executar)));
  document.getElementById("btn-enviar")?.addEventListener("click", enviar);

  if (temSql()) carregarEstrutura();
}

function mostrarAba(i, aba) {
  const q = exercicio.questoes[i], s = estado[i];
  s.aba = aba;
  const ta = document.getElementById(`ed-${i}`);
  const editavel = q.web[aba].modo === "editavel";
  ta.value = editavel ? s.codigo[aba] : (q.web[aba].inicial || "");
  ta.readOnly = !editavel || !aberto();
  ta.placeholder = editavel ? `Escreva seu ${NOME_ABA[aba]} aqui…` : "";
  app.querySelectorAll(`[data-q="${i}"]`).forEach((b) => b.classList.toggle("ativa", b.dataset.aba === aba));
}

async function carregarEstrutura() {
  const el = document.getElementById("estrutura");
  try {
    const tabelas = await estruturaBanco(exercicio.ddl, exercicio.dml);
    el.innerHTML = htmlEstrutura(tabelas, true);
    el.querySelectorAll("[data-ver]").forEach((b) => (b.onclick = () => verTabela(b.dataset.ver)));
  } catch (e) {
    el.innerHTML = `<div class="erro-sql">${esc(e.message)}</div>`;
  }
}

async function verTabela(nome) {
  const el = document.getElementById("preview");
  const q = '"' + nome.replace(/"/g, '""') + '"';
  try {
    const r = await executarConsulta(exercicio.ddl, exercicio.dml, `SELECT * FROM ${q} LIMIT 100`);
    el.innerHTML = `<div class="preview-topo"><h3>${esc(nome)}</h3><button class="link" id="fechar-preview">Fechar</button></div>${htmlResultado(r, 100)}`;
    document.getElementById("fechar-preview").onclick = () => (el.innerHTML = "");
  } catch (e) {
    el.innerHTML = `<div class="erro-sql">${esc(e.message)}</div>`;
  }
}

function atualizarBadge(i) {
  const s = estado[i];
  const b = document.getElementById(`badge-${i}`);
  if (emBranco(s, exercicio.questoes[i])) { b.className = "badge neutro"; b.textContent = "Em branco"; }
  else if (s.testado === chave(s)) {
    b.className = "badge " + (s.erro ? "erro" : "ok");
    b.textContent = s.erro ? "Testado — deu erro" : "Testado ✓";
  } else { b.className = "badge alerta"; b.textContent = "Não testado"; }
}

async function executar(i) {
  const s = estado[i], q = exercicio.questoes[i];
  const area = document.getElementById(`res-${i}`);
  const k = chave(s);

  if (s.tipo === "web") {
    s.erro = false;
    s.testado = k;
    renderPreview(area, codigoCompleto(q.web, s.codigo), {
      aoErro: () => { if (s.testado === k) { s.erro = true; atualizarBadge(i); } },
    });
    atualizarBadge(i);
    return;
  }

  if (!s.codigo.sql.trim()) { area.innerHTML = '<p class="info">Escreva uma consulta antes de executar.</p>'; return; }
  area.innerHTML = '<p class="carregando">Executando…</p>';
  try {
    area.innerHTML = htmlResultado(await executarConsulta(exercicio.ddl, exercicio.dml, s.codigo.sql));
    s.erro = false;
  } catch (e) {
    s.erro = true;
    area.innerHTML = `<div class="erro-sql"><strong>Erro:</strong> ${esc(e.message)}</div>`;
  }
  s.testado = k;
  atualizarBadge(i);
}

function lista(nums, maiuscula = false) {
  const t = nums.length === 1
    ? `a questão ${nums[0]}`
    : `as questões ${nums.slice(0, -1).join(", ")} e ${nums.at(-1)}`;
  return maiuscula ? t[0].toUpperCase() + t.slice(1) : t;
}

async function enviar() {
  const vazias = [], naoTestadas = [], comErro = [];
  estado.forEach((s, i) => {
    if (emBranco(s, exercicio.questoes[i])) vazias.push(i + 1);
    else if (s.testado !== chave(s)) naoTestadas.push(i + 1);
    else if (s.erro) comErro.push(i + 1);
  });

  if (vazias.length === estado.length) {
    await confirmar({ titulo: "Nada para entregar", html: "<p>Responda pelo menos uma questão antes de entregar.</p>", ok: "Entendi", cancelar: null });
    return;
  }

  if (naoTestadas.length || comErro.length || vazias.length) {
    let html = "";
    if (naoTestadas.length) {
      html += `<p class="aviso-forte">⚠️ Você não testou ${lista(naoTestadas)}.</p>
        <p>Recomendamos clicar em <strong>▶ Executar</strong> para conferir o resultado antes de entregar.</p>`;
    }
    if (comErro.length) html += `<p>❌ ${lista(comErro, true)} ${comErro.length > 1 ? "deram" : "deu"} erro no último teste.</p>`;
    if (vazias.length) html += `<p>📝 ${lista(vazias, true)} ${vazias.length > 1 ? "estão" : "está"} em branco.</p>`;
    html += "<p><strong>Deseja entregar mesmo assim?</strong></p>";
    const ok = await confirmar({
      titulo: naoTestadas.length ? "Exercício não testado" : "Confirme a entrega",
      html, ok: "Entregar mesmo assim", cancelar: "Voltar e revisar",
    });
    if (!ok) return;
  }

  const btn = document.getElementById("btn-enviar");
  btn.disabled = true;
  btn.textContent = "Enviando…";
  const ref = doc(db, "exercicios", exId, "respostas", aluno.codigo);
  try {
    await setDoc(ref, {
      codigo: aluno.codigo,
      nome: aluno.nome,
      respostas: estado.map((s, i) => {
        const testado = !emBranco(s, exercicio.questoes[i]) && s.testado === chave(s);
        return { tipo: s.tipo, codigo: s.codigo, testado, comErro: testado && s.erro };
      }),
      entregueSemTeste: naoTestadas.length > 0,
      enviadoEm: serverTimestamp(),
    }, { merge: true });

    anterior = (await getDoc(ref)).data();
    salvo = estado.map(chave);
    document.getElementById("status").innerHTML = htmlStatus();
    await confirmar({
      titulo: "Exercício entregue! 🎉",
      html: `<p>Sua entrega foi registrada em <strong>${formatarData(anterior.enviadoEm)}</strong>.</p>
        <p class="meta">Se precisar corrigir algo, é só editar e reenviar enquanto o exercício estiver aberto.</p>`,
      ok: "OK", cancelar: null,
    });
  } catch (e) {
    console.error(e);
    toast("Erro ao enviar: " + (e.code === "permission-denied" ? "o exercício pode ter sido encerrado." : e.message), "erro");
  } finally {
    btn.disabled = false;
    btn.textContent = anterior ? "Reenviar exercício" : "Entregar exercício";
  }
}
