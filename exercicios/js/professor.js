// Painel do professor: criar exercícios, acompanhar, corrigir (com ou sem IA) e liberar notas
import {
  db, login, onUser, ehProfessor, esc, formatarData, renderUsuario, toast, confirmar,
  prepararEditor, criarBanco, executarConsulta, estruturaBanco, htmlResultado, htmlEstrutura,
  compararResultados, ABAS, NOME_ABA, MODOS, MODELOS_WEB, webPadrao, codigoCompleto, renderPreview,
} from "./common.js";
import { configIA, abrirConfigIA, garantirIA, corrigirComIA, ErroLimite } from "./ia.js";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, query, orderBy,
  serverTimestamp, getCountFromServer,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app = document.getElementById("app");
let usuario = null;
let cache = null; // { id, ex, gab, gabDoc, gabRes, respostas, alunos, correcoes }
let autorizado = false;

onUser(async (u) => {
  usuario = u;
  autorizado = false;
  renderUsuario(document.getElementById("usuario"), u);
  if (!u) return telaLogin();
  carregando("Conferindo acesso…");
  try {
    autorizado = await ehProfessor(u);
  } catch (e) {
    app.innerHTML = `<section class="card centro"><h1>Não foi possível conectar</h1><p>${esc(e.message)}</p></section>`;
    return;
  }
  if (!autorizado) {
    app.innerHTML = `<section class="card centro"><h1>Acesso restrito</h1>
      <p>A conta <strong>${esc(u.email)}</strong> não tem acesso ao painel do professor.</p>
      <p class="meta">O e-mail do professor é definido nas regras do Firestore (função <code>professor()</code>).</p></section>`;
    return;
  }
  rotear();
});
window.addEventListener("hashchange", () => { if (autorizado) rotear(); });

function rotear() {
  const [rota, id, cod] = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  let p;
  if (rota === "novo") p = telaFormulario(null);
  else if (rota === "editar" && id) p = telaFormulario(id);
  else if (rota === "entregas" && id && cod) p = telaCorrecao(id, decodeURIComponent(cod));
  else if (rota === "entregas" && id) p = telaEntregas(id);
  else p = telaLista();
  p.catch((e) => {
    console.error(e);
    const negado = e.code === "permission-denied";
    app.innerHTML = `<section class="card"><h1>Algo deu errado</h1>
      <div class="erro-sql">${esc(negado ? "Permissão negada pelo Firestore. Confira se as regras mais recentes (firestore.rules) foram publicadas." : e.message)}</div>
      <p><a href="#/">← Voltar</a></p></section>`;
  });
  window.scrollTo(0, 0);
}

function telaLogin() {
  app.innerHTML = `<section class="card centro login"><h1>Painel do professor</h1>
    <p>Entre com a sua conta Google de professor.</p>
    <button class="primario grande" id="btn-login">Entrar com Google</button></section>`;
  document.getElementById("btn-login").onclick = () =>
    login().catch((e) => toast("Não foi possível entrar: " + e.message, "erro"));
}

const linkAluno = (id) => new URL(`index.html?ex=${id}`, location.href).href;
const carregando = (txt = "Carregando…") => (app.innerHTML = `<p class="carregando">${txt}</p>`);
const tipoDe = (q) => q.tipo || "sql";
const temNota = (r) => r.nota !== undefined && r.nota !== null;
const ms = (ts) => (ts?.toMillis ? ts.toMillis() : 0);

// Tipo do exercício: "sql" (Banco de Dados), "web" (HTML/CSS/JS) ou "misto" (exercícios antigos)
function areaDe(ex) {
  if (ex.area) return ex.area;
  const tipos = new Set((ex.questoes || []).map(tipoDe));
  if (tipos.size === 0) return null;
  if (tipos.size === 2) return "misto";
  return tipos.has("web") ? "web" : "sql";
}
const NOME_AREA = { sql: "Banco de Dados", web: "HTML / CSS / JS", misto: "Banco de Dados + HTML/CSS/JS" };

async function copiarLink(id) {
  try { await navigator.clipboard.writeText(linkAluno(id)); toast("Link copiado! Agora é só enviar aos alunos."); }
  catch { prompt("Copie o link do exercício:", linkAluno(id)); }
}

// ================= LISTA =================
async function telaLista() {
  carregando();
  const snap = await getDocs(query(collection(db, "exercicios"), orderBy("criadoEm", "desc")));
  const itens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  app.innerHTML = `
    <div class="titulo-pagina">
      <h1>Meus exercícios</h1>
      <div class="ex-acoes">
        <button class="secundario" id="btn-cfg-ia">🤖 ${configIA() ? "IA configurada" : "Configurar IA"}</button>
        <a class="botao primario" href="#/novo">+ Novo exercício</a>
      </div>
    </div>
    ${itens.length ? itens.map((e) => {
      const aberto = e.aberto !== false;
      return `
      <section class="card ex-item">
        <div class="ex-info">
          <div class="ex-titulo-linha">
            <h2>${esc(e.titulo)}</h2>
            <span class="badge ${aberto ? "ok" : "neutro"}">${aberto ? "Aberto" : "Encerrado"}</span>
          </div>
          <p class="meta">${NOME_AREA[areaDe(e)] || "—"} · ${e.questoes?.length || 0} questão(ões) · criado em ${formatarData(e.criadoEm)} ·
            <span id="cont-${e.id}">… entregas</span></p>
        </div>
        <div class="ex-acoes">
          <a class="botao primario" href="#/entregas/${e.id}">Ver entregas</a>
          <button class="secundario" data-acao="copiar" data-id="${e.id}">Copiar link</button>
          <a class="botao secundario" href="${linkAluno(e.id)}" target="_blank" rel="noopener">Abrir como aluno</a>
          <a class="botao secundario" href="#/editar/${e.id}">Editar</a>
          <button class="secundario" data-acao="alternar" data-id="${e.id}" data-aberto="${aberto}">${aberto ? "Encerrar" : "Reabrir"}</button>
          <button class="perigo-texto link" data-acao="excluir" data-id="${e.id}">Excluir</button>
        </div>
      </section>`;
    }).join("") : `
      <section class="card centro">
        <p>Você ainda não criou nenhum exercício.</p>
        <a class="botao primario" href="#/novo">Criar o primeiro</a>
      </section>`}`;

  document.getElementById("btn-cfg-ia").onclick = async () => { await abrirConfigIA(); telaLista(); };

  app.querySelectorAll("[data-acao]").forEach((b) => {
    const id = b.dataset.id;
    const ex = itens.find((x) => x.id === id);
    b.onclick = async () => {
      if (b.dataset.acao === "copiar") return copiarLink(id);
      if (b.dataset.acao === "alternar") {
        const abrir = b.dataset.aberto !== "true";
        await updateDoc(doc(db, "exercicios", id), { aberto: abrir });
        toast(abrir ? "Exercício reaberto." : "Exercício encerrado — os alunos não podem mais entregar.");
        return telaLista();
      }
      if (b.dataset.acao === "excluir") {
        const ok = await confirmar({
          titulo: "Excluir exercício?",
          html: `<p>Isso apaga <strong>${esc(ex.titulo)}</strong> e <strong>todas as entregas</strong> dos alunos. Não dá para desfazer.</p>`,
          ok: "Excluir definitivamente", perigo: true,
        });
        if (!ok) return;
        const [resp, cor] = await Promise.all([
          getDocs(collection(db, "exercicios", id, "respostas")),
          getDocs(collection(db, "exercicios", id, "correcoes")).catch(() => ({ docs: [] })),
        ]);
        const refs = [...resp.docs, ...cor.docs].map((d) => d.ref);
        refs.push(doc(db, "exercicios", id, "privado", "gabarito"), doc(db, "exercicios", id));
        for (let i = 0; i < refs.length; i += 450) {
          const batch = writeBatch(db);
          refs.slice(i, i + 450).forEach((r) => batch.delete(r));
          await batch.commit();
        }
        cache = null;
        toast("Exercício excluído.");
        return telaLista();
      }
    };
  });

  itens.forEach(async (e) => {
    try {
      const c = await getCountFromServer(collection(db, "exercicios", e.id, "respostas"));
      const el = document.getElementById(`cont-${e.id}`);
      if (el) el.textContent = `${c.data().count} entrega(s)`;
    } catch { /* ignora */ }
  });
}

// ================= FORMULÁRIO (novo / editar) =================
function novaQuestao(tipo = "sql") {
  return { enunciado: "", tipo, gabSql: "", web: webPadrao(), gabWeb: { html: "", css: "", js: "" } };
}

async function telaFormulario(id) {
  carregando();
  let ex = { titulo: "", descricao: "", ddl: "", dml: "", questoes: [] };
  let gab = [], criteriosIA = "";
  if (id) {
    const [s, g] = await Promise.all([
      getDoc(doc(db, "exercicios", id)),
      getDoc(doc(db, "exercicios", id, "privado", "gabarito")),
    ]);
    if (!s.exists()) throw new Error("Exercício não encontrado.");
    ex = s.data();
    gab = g.exists() ? g.data().questoes || [] : [];
    criteriosIA = g.exists() ? g.data().criteriosIA || "" : "";
  }
  let area = id ? areaDe(ex) : null;
  let questoes = ex.questoes.map((q, i) => ({
    ...novaQuestao(tipoDe(q)),
    enunciado: q.enunciado,
    web: q.web || webPadrao(),
    gabSql: gab[i]?.sql || "",
    gabWeb: { html: gab[i]?.html || "", css: gab[i]?.css || "", js: gab[i]?.js || "" },
  }));

  app.innerHTML = `
    <div class="titulo-pagina">
      <div><a href="#/" class="voltar">← Exercícios</a><h1>${id ? "Editar exercício" : "Novo exercício"}</h1></div>
    </div>

    <section class="card">
      <p class="subtitulo" style="margin-top:0">Tipo do exercício</p>
      <div class="opcoes-area">
        <button type="button" class="opcao-area" data-area="sql"><span>🗄️</span><strong>Banco de Dados</strong><small>Consultas SQL com banco pronto</small></button>
        <button type="button" class="opcao-area" data-area="web"><span>🌐</span><strong>HTML, CSS e JavaScript</strong><small>Página com pré-visualização e console</small></button>
      </div>
      <p class="meta" id="aviso-misto" hidden>Este exercício antigo mistura SQL e HTML/CSS/JS. Ele continua funcionando; ao escolher um tipo acima, as questões são convertidas.</p>
    </section>

    <div id="corpo-form">
      <section class="card">
        <label class="campo">Título<input id="f-titulo" placeholder="Ex.: Aula 33 — INNER, LEFT e RIGHT JOIN"></label>
        <label class="campo">Instruções gerais <span class="meta">(opcional)</span>
          <textarea id="f-descricao" rows="3" placeholder="Orientações que aparecem no topo do exercício"></textarea></label>
      </section>

      <section class="card" id="card-banco">
        <h2>Banco de dados</h2>
        <p class="dica">Envie os arquivos .sql ou cole o conteúdo. Se o arquivo já tiver tabelas e dados juntos, use só o campo DDL.
          O banco roda no navegador do aluno (SQLite) e é recriado a cada execução.
          Trechos comuns de MySQL (ENGINE, AUTO_INCREMENT, CHARSET…) são ajustados automaticamente.</p>
        <div class="grade-2">
          ${["ddl", "dml"].map((k) => `
            <div>
              <div class="label-linha">
                <strong>${k === "ddl" ? "DDL — criação das tabelas" : "DML — inserção dos dados"}</strong>
                <label class="botao secundario pequeno">Enviar arquivo
                  <input type="file" accept=".sql,.txt" data-arquivo="f-${k}" hidden></label>
              </div>
              <textarea id="f-${k}" class="editor" rows="10" spellcheck="false"
                placeholder="${k === "ddl" ? "CREATE TABLE …" : "INSERT INTO …"}"></textarea>
            </div>`).join("")}
        </div>
        <div class="linha-botoes"><button class="secundario" id="btn-testar-banco">▶ Testar banco</button></div>
        <div id="teste-banco"></div>
      </section>

      <section class="card">
        <h2>Questões</h2>
        <p class="dica" id="dica-questoes"></p>
        <div id="lista-questoes"></div>
        <div class="linha-botoes" id="botoes-add"></div>
      </section>

      <section class="card">
        <h2>Critérios para a correção com IA <span class="meta">(opcional — o aluno não vê)</span></h2>
        <p class="dica">Diga como a IA deve dar a nota. Se ficar em branco, todas as questões valem o mesmo e a IA compara com o gabarito.</p>
        <textarea id="f-criterios" rows="4" style="width:100%"
          placeholder="Ex.: Questão 1 vale 3 pontos, questão 2 vale 4 (exigir IS NULL), questão 3 vale 3. Descontar 1 ponto se usar o JOIN errado, mesmo que o resultado bata."></textarea>
      </section>

      <div class="acoes-finais"><button class="primario grande" id="btn-salvar">Salvar exercício</button></div>
    </div>`;

  const $ = (s) => document.getElementById(s);
  $("f-titulo").value = ex.titulo;
  $("f-descricao").value = ex.descricao || "";
  $("f-ddl").value = ex.ddl || "";
  $("f-dml").value = ex.dml || "";
  $("f-criterios").value = criteriosIA;
  prepararEditor($("f-ddl"));
  prepararEditor($("f-dml"));

  app.querySelectorAll("[data-arquivo]").forEach((inp) => {
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      $(inp.dataset.arquivo).value = await f.text();
      toast(`Arquivo "${f.name}" carregado.`);
      inp.value = "";
    };
  });

  $("btn-testar-banco").onclick = async () => {
    const el = $("teste-banco");
    el.innerHTML = '<p class="carregando">Montando o banco…</p>';
    try {
      const t = await estruturaBanco($("f-ddl").value, $("f-dml").value);
      el.innerHTML = `<div class="sucesso">Banco criado com sucesso: ${t.length} tabela(s).</div>${htmlEstrutura(t)}`;
    } catch (e) {
      el.innerHTML = `<div class="erro-sql">${esc(e.message)}</div>`;
    }
  };

  // ----- Tipo do exercício -----
  function aplicarArea() {
    app.querySelectorAll(".opcao-area").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.area === area)));
    $("aviso-misto").hidden = area !== "misto";
    $("corpo-form").hidden = !area;
    $("card-banco").hidden = !(area === "sql" || area === "misto");
    $("dica-questoes").innerHTML = area === "web"
      ? "Para cada questão, escolha quais abas o aluno edita. O gabarito é opcional e nunca aparece para o aluno: na correção, a página dele fica ao lado da página do gabarito."
      : "O gabarito é opcional e nunca aparece para o aluno. Com gabarito, o painel compara o resultado de cada entrega automaticamente.";
    const botoes = area === "misto"
      ? '<button class="secundario" data-add="sql">+ Questão de SQL</button><button class="secundario" data-add="web">+ Questão de HTML / CSS / JS</button>'
      : `<button class="secundario" data-add="${area}">+ Adicionar questão</button>`;
    $("botoes-add").innerHTML = area ? botoes : "";
    $("botoes-add").querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => {
      questoes.push(novaQuestao(b.dataset.add));
      renderQuestoes();
      listaQ.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  app.querySelectorAll(".opcao-area").forEach((b) => (b.onclick = async () => {
    const nova = b.dataset.area;
    if (nova === area) return;
    const outras = questoes.filter((q) => q.tipo !== nova);
    const temConteudo = outras.some((q) => q.gabSql.trim() || ABAS.some((a) => q.web[a].inicial.trim() || q.gabWeb[a].trim()));
    if (temConteudo && !(await confirmar({
      titulo: "Trocar o tipo do exercício?",
      html: `<p>As questões serão convertidas para <strong>${NOME_AREA[nova]}</strong>. Os enunciados ficam; gabaritos e códigos das questões convertidas são apagados.</p>`,
      ok: "Trocar",
    }))) return;
    area = nova;
    questoes = questoes.map((q) => (q.tipo === nova ? q : { ...novaQuestao(nova), enunciado: q.enunciado }));
    if (!questoes.length) questoes.push(novaQuestao(nova));
    aplicarArea();
    renderQuestoes();
  }));

  // ----- Questões -----
  const listaQ = $("lista-questoes");

  function htmlQuestaoForm(q, i) {
    const cab = `
      <div class="questao-topo">
        <h3>Questão ${i + 1}${area === "misto" ? ` · ${q.tipo === "sql" ? "SQL" : "HTML / CSS / JS"}` : ""}</h3>
        ${questoes.length > 1 ? `<button class="link perigo-texto" data-remover="${i}">Remover</button>` : ""}
      </div>
      <label class="campo">Enunciado
        <textarea data-campo="enunciado" data-i="${i}" rows="3">${esc(q.enunciado)}</textarea></label>`;

    if (q.tipo === "sql") {
      return `<div class="questao-form">${cab}
        <label class="campo">Gabarito <span class="meta">(SQL esperado — opcional)</span>
          <textarea class="editor" data-campo="gabSql" data-i="${i}" rows="4" spellcheck="false">${esc(q.gabSql)}</textarea></label>
        <div class="linha-botoes"><button class="secundario pequeno" data-testar-gab="${i}">▶ Testar gabarito</button></div>
        <div id="gab-res-${i}"></div></div>`;
    }

    const editaveis = ABAS.filter((a) => q.web[a].modo === "editavel");
    return `<div class="questao-form">${cab}
      <div class="linha-tipo">
        <span class="meta">Modelo rápido:</span>
        <button class="secundario pequeno" data-modelo="html" data-i="${i}">Exercício de HTML</button>
        <button class="secundario pequeno" data-modelo="css" data-i="${i}">Exercício de CSS</button>
        <button class="secundario pequeno" data-modelo="js" data-i="${i}">Exercício de JS</button>
        <button class="secundario pequeno" data-modelo="completo" data-i="${i}">Aluno edita tudo</button>
      </div>
      <p class="subtitulo">Código que o aluno recebe</p>
      <div class="web-cfg">${ABAS.map((a) => `
        <div>
          <div class="label-linha"><strong>${NOME_ABA[a]}</strong>
            <select data-modo="${a}" data-i="${i}">${Object.entries(MODOS).map(([k, v]) =>
              `<option value="${k}" ${q.web[a].modo === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          <textarea class="editor" data-web="${a}" data-i="${i}" rows="7" spellcheck="false"
            placeholder="${q.web[a].modo === "editavel" ? "Código inicial (opcional)" : "Código fornecido"}">${esc(q.web[a].inicial)}</textarea>
        </div>`).join("")}</div>
      ${editaveis.length ? `
        <p class="subtitulo">Gabarito <span class="meta">(opcional — o que você espera nas abas que o aluno edita)</span></p>
        <div class="web-cfg">${editaveis.map((a) => `
          <div><div class="label-linha"><strong>${NOME_ABA[a]}</strong></div>
            <textarea class="editor" data-gabweb="${a}" data-i="${i}" rows="7" spellcheck="false">${esc(q.gabWeb[a])}</textarea></div>`).join("")}
        </div>` : '<div class="alerta">Deixe pelo menos uma aba como “Aluno edita”.</div>'}
      <div class="linha-botoes">
        <button class="secundario pequeno" data-prev-aluno="${i}">▶ Ver como o aluno recebe</button>
        <button class="secundario pequeno" data-prev-gab="${i}">▶ Ver gabarito</button>
      </div>
      <div id="web-prev-${i}"></div></div>`;
  }

  function renderQuestoes() {
    listaQ.innerHTML = questoes.map(htmlQuestaoForm).join("");

    listaQ.querySelectorAll("textarea[data-i]").forEach((ta) => {
      const q = questoes[+ta.dataset.i];
      ta.oninput = () => {
        if (ta.dataset.campo) q[ta.dataset.campo] = ta.value;
        else if (ta.dataset.web) q.web[ta.dataset.web].inicial = ta.value;
        else if (ta.dataset.gabweb) q.gabWeb[ta.dataset.gabweb] = ta.value;
      };
      if (ta.classList.contains("editor")) prepararEditor(ta);
    });
    listaQ.querySelectorAll("[data-modo]").forEach((sel) => (sel.onchange = () => {
      questoes[+sel.dataset.i].web[sel.dataset.modo].modo = sel.value;
      renderQuestoes();
    }));
    listaQ.querySelectorAll("[data-modelo]").forEach((b) => (b.onclick = () => {
      const q = questoes[+b.dataset.i];
      for (const a of ABAS) q.web[a].modo = MODELOS_WEB[b.dataset.modelo][a];
      renderQuestoes();
    }));
    listaQ.querySelectorAll("[data-remover]").forEach((b) => (b.onclick = () => {
      questoes.splice(+b.dataset.remover, 1);
      renderQuestoes();
    }));
    listaQ.querySelectorAll("[data-testar-gab]").forEach((b) => (b.onclick = () => testarGabarito(+b.dataset.testarGab)));
    listaQ.querySelectorAll("[data-prev-aluno]").forEach((b) => (b.onclick = () => {
      const i = +b.dataset.prevAluno, q = questoes[i];
      const inicial = Object.fromEntries(ABAS.map((a) => [a, q.web[a].inicial]));
      renderPreview($(`web-prev-${i}`), codigoCompleto(q.web, inicial));
    }));
    listaQ.querySelectorAll("[data-prev-gab]").forEach((b) => (b.onclick = () => {
      const i = +b.dataset.prevGab, q = questoes[i];
      renderPreview($(`web-prev-${i}`), codigoCompleto(q.web, q.gabWeb));
    }));
  }

  async function testarGabarito(i) {
    const el = $(`gab-res-${i}`);
    if (!questoes[i].gabSql.trim()) { el.innerHTML = '<p class="info">Escreva o SQL do gabarito primeiro.</p>'; return; }
    try {
      el.innerHTML = htmlResultado(await executarConsulta($("f-ddl").value, $("f-dml").value, questoes[i].gabSql));
    } catch (e) {
      el.innerHTML = `<div class="erro-sql">${esc(e.message)}</div>`;
    }
  }

  aplicarArea();
  renderQuestoes();

  $("btn-salvar").onclick = async () => {
    if (!area) return toast("Escolha o tipo do exercício.", "erro");
    const titulo = $("f-titulo").value.trim();
    const descricao = $("f-descricao").value.trim();
    const criterios = $("f-criterios").value.trim();
    const temSql = questoes.some((q) => q.tipo === "sql");
    const ddl = temSql ? $("f-ddl").value : "";
    const dml = temSql ? $("f-dml").value : "";
    if (!titulo) return toast("Dê um título ao exercício.", "erro");
    if (!questoes.length) return toast("Adicione pelo menos uma questão.", "erro");
    if (questoes.some((q) => !q.enunciado.trim())) return toast("Preencha o enunciado de todas as questões.", "erro");
    if (temSql && !ddl.trim()) return toast("Informe o banco de dados (campo DDL).", "erro");
    const semEditavel = questoes.findIndex((q) => q.tipo === "web" && !ABAS.some((a) => q.web[a].modo === "editavel"));
    if (semEditavel >= 0) return toast(`Na questão ${semEditavel + 1}, deixe pelo menos uma aba para o aluno editar.`, "erro");
    if (new Blob([ddl, dml, descricao, JSON.stringify(questoes)]).size > 900_000) {
      return toast("O exercício passa de ~900 KB, acima do limite de um documento do Firestore.", "erro");
    }

    if (temSql) {
      try { (await criarBanco(ddl, dml)).close(); }
      catch (e) { $("teste-banco").innerHTML = `<div class="erro-sql">${esc(e.message)}</div>`; return toast("O banco tem erro — veja a mensagem.", "erro"); }
      const falhas = [];
      for (let i = 0; i < questoes.length; i++) {
        if (questoes[i].tipo !== "sql" || !questoes[i].gabSql.trim()) continue;
        try { await executarConsulta(ddl, dml, questoes[i].gabSql); } catch { falhas.push(i + 1); }
      }
      if (falhas.length && !(await confirmar({
        titulo: "Gabarito com erro",
        html: `<p>O gabarito da(s) questão(ões) ${falhas.join(", ")} não executou. Salvar mesmo assim?</p>`,
        ok: "Salvar mesmo assim",
      }))) return;
    }

    const btn = $("btn-salvar");
    btn.disabled = true; btn.textContent = "Salvando…";
    try {
      const ref = id ? doc(db, "exercicios", id) : doc(collection(db, "exercicios"));
      const dados = {
        titulo, descricao, ddl, dml, area,
        questoes: questoes.map((q) => q.tipo === "sql"
          ? { tipo: "sql", enunciado: q.enunciado.trim() }
          : { tipo: "web", enunciado: q.enunciado.trim(), web: q.web }),
        atualizadoEm: serverTimestamp(),
      };
      const gabarito = questoes.map((q) => q.tipo === "sql"
        ? { sql: q.gabSql || "" }
        : Object.fromEntries(ABAS.filter((a) => q.web[a].modo === "editavel").map((a) => [a, q.gabWeb[a] || ""])));
      const batch = writeBatch(db);
      if (id) batch.update(ref, dados);
      else batch.set(ref, { ...dados, aberto: true, criadoEm: serverTimestamp() });
      batch.set(doc(db, "exercicios", ref.id, "privado", "gabarito"), { questoes: gabarito, criteriosIA: criterios });
      await batch.commit();
      cache = null;

      if (!id) {
        const copiar = await confirmar({
          titulo: "Exercício criado! 🎉",
          html: `<p>Envie este link aos alunos. Eles entram com o mesmo código pessoal que já usam.</p>
            <p class="link-box">${esc(linkAluno(ref.id))}</p>`,
          ok: "Copiar link", cancelar: "Fechar",
        });
        if (copiar) await copiarLink(ref.id);
      } else toast("Exercício atualizado.");
      location.hash = "#/";
    } catch (e) {
      console.error(e);
      toast("Erro ao salvar: " + (e.code === "permission-denied" ? "permissão negada — confira as regras do Firestore." : e.message), "erro");
      btn.disabled = false; btn.textContent = "Salvar exercício";
    }
  };
}

// ================= ENTREGAS =================
async function carregarEntregas(id) {
  if (cache?.id === id) return cache;
  const [s, g, r, al, co] = await Promise.all([
    getDoc(doc(db, "exercicios", id)),
    getDoc(doc(db, "exercicios", id, "privado", "gabarito")),
    getDocs(collection(db, "exercicios", id, "respostas")),
    getDocs(collection(db, "alunos")).catch(() => null),
    getDocs(collection(db, "exercicios", id, "correcoes")).catch(() => null),
  ]);
  if (!s.exists()) throw new Error("Exercício não encontrado.");
  const ex = s.data();
  const gabDoc = g.exists() ? g.data() : {};
  const gab = gabDoc.questoes || [];
  const respostas = r.docs.map((d) => ({ codigo: d.id, ...d.data() }))
    .sort((a, b) => (a.nome || a.codigo).localeCompare(b.nome || b.codigo, "pt-BR"));
  const alunos = al ? al.docs.map((d) => ({ codigo: d.id, nome: d.data().nome || "" })) : null;
  const correcoes = co ? Object.fromEntries(co.docs.map((d) => [d.id, d.data()])) : null;
  const gabRes = [];
  for (let i = 0; i < ex.questoes.length; i++) {
    const sql = gab[i]?.sql;
    gabRes[i] = tipoDe(ex.questoes[i]) === "sql" && sql?.trim()
      ? await executarConsulta(ex.ddl, ex.dml, sql).catch(() => null) : null;
  }
  cache = { id, ex, gab, gabDoc, gabRes, respostas, alunos, correcoes };
  return cache;
}

async function conferirSql(c, i, sql) {
  if (!sql?.trim()) return { status: "branco", res: null, erro: null };
  try {
    const res = await executarConsulta(c.ex.ddl, c.ex.dml, sql);
    return { status: c.gabRes[i] ? compararResultados(res, c.gabRes[i]) : "sem-gabarito", res, erro: null };
  } catch (e) {
    return { status: "erro", res: null, erro: e.message };
  }
}

const reenviadoAposCorrecao = (r) => r.corrigidoEm && r.enviadoEm && ms(r.enviadoEm) > ms(r.corrigidoEm);

// Situação da correção de uma entrega
function situacao(c, r) {
  const cor = c.correcoes?.[r.codigo];
  if (cor && !cor.liberada) {
    const desatualizada = ms(r.enviadoEm) > (cor.envioAvaliado || 0);
    return { tipo: "rascunho", cor, desatualizada };
  }
  if (temNota(r)) return { tipo: "liberada", cor, desatualizada: reenviadoAposCorrecao(r) };
  return { tipo: "sem", cor: null, desatualizada: false };
}

function badgeSituacao(s) {
  if (s.tipo === "rascunho") return `<span class="badge alerta">Rascunho · ${esc(s.cor.nota)}${s.cor.origem === "ia" ? " (IA)" : ""}</span>`;
  if (s.tipo === "liberada") return '<span class="badge ok">Liberada</span>';
  return '<span class="badge neutro">Sem correção</span>';
}

// Dados que a IA recebe para corrigir uma entrega (sem nome nem código do aluno)
async function dadosParaIA(c, r) {
  const questoes = [];
  for (let i = 0; i < c.ex.questoes.length; i++) {
    const q = c.ex.questoes[i];
    const resp = r.respostas?.[i] || {};
    const item = { enunciado: q.enunciado, tipo: tipoDe(q), gabarito: c.gab[i] || {}, resposta: resp.codigo || {}, comErro: !!resp.comErro };
    if (item.tipo === "sql") {
      const conf = await conferirSql(c, i, resp.codigo?.sql);
      item.conferencia = { ...conf, esperado: c.gabRes[i] };
    } else {
      item.fornecido = Object.fromEntries(ABAS.filter((a) => q.web[a].modo !== "editavel").map((a) => [a, q.web[a].inicial || ""]));
      item.resposta = Object.fromEntries(ABAS.filter((a) => q.web[a].modo === "editavel").map((a) => [a, resp.codigo?.[a] || ""]));
    }
    questoes.push(item);
  }
  return { titulo: c.ex.titulo, criterios: c.gabDoc.criteriosIA || "", questoes };
}

// Corrige uma entrega com IA e salva como rascunho (o aluno não vê)
async function corrigirEntregaIA(c, r, aoEsperar) {
  const res = await corrigirComIA(await dadosParaIA(c, r), { aoEsperar });
  const cor = {
    nota: res.nota, feedback: res.feedback, questoes: res.questoes, modelo: res.modelo,
    origem: "ia", liberada: false, envioAvaliado: ms(r.enviadoEm), geradoEm: serverTimestamp(),
  };
  await setDoc(doc(db, "exercicios", c.id, "correcoes", r.codigo), cor);
  c.correcoes[r.codigo] = { ...cor, geradoEm: { toMillis: () => Date.now(), toDate: () => new Date() } };
  return c.correcoes[r.codigo];
}

// Libera nota + feedback para o aluno (grava na entrega dele)
function liberarNoLote(batch, c, codigo, nota, feedback, extra = {}) {
  batch.update(doc(db, "exercicios", c.id, "respostas", codigo), { nota, comentario: feedback, corrigidoEm: serverTimestamp() });
  batch.set(doc(db, "exercicios", c.id, "correcoes", codigo), { nota, feedback, liberada: true, liberadoEm: serverTimestamp(), ...extra }, { merge: true });
}
function aplicarLiberacaoLocal(c, r, nota, feedback) {
  const agora = { toMillis: () => Date.now(), toDate: () => new Date() };
  Object.assign(r, { nota, comentario: feedback, corrigidoEm: agora });
  c.correcoes[r.codigo] = { ...(c.correcoes[r.codigo] || {}), nota, feedback, liberada: true, liberadoEm: agora };
}

async function telaEntregas(id) {
  carregando("Carregando entregas…");
  const c = await carregarEntregas(id);
  const { ex, respostas, gabRes, alunos } = c;
  const comGab = gabRes.filter(Boolean).length;
  const sits = Object.fromEntries(respostas.map((r) => [r.codigo, situacao(c, r)]));
  const liberadas = respostas.filter((r) => sits[r.codigo].tipo === "liberada").length;
  const rascunhos = respostas.filter((r) => sits[r.codigo].tipo === "rascunho");
  const paraIA = respostas.filter((r) => {
    const s = sits[r.codigo];
    return s.tipo === "sem" || s.desatualizada;
  });
  const semTeste = respostas.filter((r) => r.entregueSemTeste).length;
  const entregaram = new Set(respostas.map((r) => r.codigo));
  const pendentes = alunos ? alunos.filter((a) => !entregaram.has(a.codigo)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) : null;

  app.innerHTML = `
    <div class="titulo-pagina">
      <div><a href="#/" class="voltar">← Exercícios</a><h1>${esc(ex.titulo)}</h1></div>
      <div class="ex-acoes">
        <button class="secundario" id="btn-copiar">Copiar link</button>
        <button class="secundario" id="btn-atualizar">Atualizar</button>
      </div>
    </div>
    ${c.correcoes === null ? '<div class="alerta">Publique as regras mais recentes do Firestore (firestore.rules) para usar rascunhos e a correção com IA.</div>' : ""}
    <div class="resumo">
      <div class="card numero"><span>${respostas.length}${alunos ? ` <small class="meta">de ${alunos.length}</small>` : ""}</span>entregas</div>
      <div class="card numero"><span>${rascunhos.length}</span>rascunhos (aluno não vê)</div>
      <div class="card numero"><span>${liberadas}</span>notas liberadas</div>
      <div class="card numero"><span>${semTeste}</span>entregues sem testar</div>
    </div>
    ${respostas.length && c.correcoes ? `
    <section class="card barra-ia">
      <div>
        <strong>Correção com IA</strong>
        <p class="meta">A IA sugere nota e feedback como <strong>rascunho</strong>. O aluno só vê depois que você liberar.</p>
      </div>
      <div class="ex-acoes">
        <button class="secundario" id="btn-cfg-ia">⚙️ ${configIA() ? "IA configurada" : "Configurar IA"}</button>
        <button class="secundario" id="btn-ia-lote" ${paraIA.length ? "" : "disabled"}>🤖 Corrigir com IA (${paraIA.length})</button>
        <button class="primario" id="btn-liberar" ${rascunhos.length ? "" : "disabled"}>Liberar notas (${rascunhos.length})</button>
      </div>
      <div id="progresso-ia" class="meta"></div>
    </section>` : ""}
    <section class="card">
      ${respostas.length ? `
      <div class="tabela-wrap"><table class="lista-entregas">
        <thead><tr><th>Aluno</th><th>Entregue em</th><th>Testou?</th>${comGab ? "<th>Conferência (SQL)</th>" : ""}<th>Correção</th><th>Nota</th><th></th></tr></thead>
        <tbody>${respostas.map((r) => {
          const s = sits[r.codigo];
          return `
          <tr>
            <td><strong>${esc(r.nome || "(sem nome)")}</strong><br><span class="meta">${esc(r.codigo)}</span></td>
            <td>${formatarData(r.enviadoEm)}${s.desatualizada ? '<br><span class="badge alerta">reenviou após correção</span>' : ""}</td>
            <td>${r.entregueSemTeste ? '<span class="badge alerta">Entregou sem testar</span>' : '<span class="badge ok">Testou</span>'}</td>
            ${comGab ? `<td id="auto-${esc(r.codigo)}"><span class="meta">calculando…</span></td>` : ""}
            <td id="sit-${esc(r.codigo)}">${badgeSituacao(s)}</td>
            <td id="nota-${esc(r.codigo)}">${temNota(r) ? esc(r.nota) : "—"}</td>
            <td><a class="botao secundario pequeno" href="#/entregas/${id}/${encodeURIComponent(r.codigo)}">Corrigir</a></td>
          </tr>`;
        }).join("")}
        </tbody></table></div>` : '<p class="centro">Nenhuma entrega ainda.</p>'}
    </section>
    ${pendentes?.length ? `
    <section class="card">
      <h2>Ainda não entregaram (${pendentes.length})</h2>
      <div class="pendentes">${pendentes.map((a) => `<span>${esc(a.nome)}</span>`).join("")}</div>
    </section>` : ""}`;

  document.getElementById("btn-copiar").onclick = () => copiarLink(id);
  document.getElementById("btn-atualizar").onclick = () => { cache = null; telaEntregas(id); };
  document.getElementById("btn-cfg-ia")?.addEventListener("click", async () => { await abrirConfigIA(); telaEntregas(id); });

  document.getElementById("btn-ia-lote")?.addEventListener("click", async () => {
    if (!(await garantirIA())) return;
    const ok = await confirmar({
      titulo: "Corrigir com IA",
      html: `<p>A IA vai sugerir nota e feedback para <strong>${paraIA.length} entrega(s)</strong> sem correção (ou reenviadas depois da correção).</p>
        <p>Tudo fica como <strong>rascunho</strong>: revise e depois clique em <em>Liberar notas</em>.</p>`,
      ok: "Começar",
    });
    if (!ok) return;
    const prog = document.getElementById("progresso-ia");
    const btn = document.getElementById("btn-ia-lote");
    btn.disabled = true;
    let feitos = 0;
    const falhas = [];
    for (const r of paraIA) {
      const rotulo = `Corrigindo ${feitos + 1} de ${paraIA.length}: ${r.nome || r.codigo}…`;
      prog.textContent = rotulo;
      try {
        await corrigirEntregaIA(c, r, (seg) => {
          prog.textContent = seg > 0 ? `${rotulo} Limite por minuto da IA atingido — continuando em ${seg}s (não feche a página).` : rotulo;
        });
        const s = situacao(c, r);
        const el = document.getElementById(`sit-${r.codigo}`);
        if (el) el.innerHTML = badgeSituacao(s);
      } catch (e) {
        console.error(e);
        falhas.push(`${r.nome || r.codigo}: ${e.message}`);
        // chave inválida ou limite esgotado por muito tempo: não adianta continuar
        if (e instanceof ErroLimite || /\b(401|403)\b/.test(e.message)) {
          if (e instanceof ErroLimite) falhas.push(`As outras ${paraIA.length - feitos - 1} entrega(s) ficaram para depois: clique em "Corrigir com IA" de novo mais tarde.`);
          break;
        }
      }
      feitos++;
    }
    toast(falhas.length ? `IA terminou com ${falhas.length} erro(s).` : "Correção com IA concluída. Revise e libere as notas.", falhas.length ? "erro" : "ok");
    if (falhas.length) {
      await confirmar({ titulo: "Algumas correções falharam", html: `<ul>${falhas.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`, ok: "OK", cancelar: null });
    }
    telaEntregas(id);
  });

  document.getElementById("btn-liberar")?.addEventListener("click", async () => {
    const lista = rascunhos.map((r) => `<li>${esc(r.nome || r.codigo)} — <strong>${esc(sits[r.codigo].cor.nota)}</strong>${sits[r.codigo].desatualizada ? " ⚠️ reenviou depois" : ""}</li>`).join("");
    const ok = await confirmar({
      titulo: `Liberar ${rascunhos.length} nota(s)?`,
      html: `<p>Os alunos abaixo passam a ver a nota e o feedback:</p><ul class="lista-liberar">${lista}</ul>`,
      ok: "Liberar",
    });
    if (!ok) return;
    try {
      for (let i = 0; i < rascunhos.length; i += 200) {
        const batch = writeBatch(db);
        rascunhos.slice(i, i + 200).forEach((r) => { const cor = sits[r.codigo].cor; liberarNoLote(batch, c, r.codigo, cor.nota, cor.feedback || ""); });
        await batch.commit();
        rascunhos.slice(i, i + 200).forEach((r) => { const cor = sits[r.codigo].cor; aplicarLiberacaoLocal(c, r, cor.nota, cor.feedback || ""); });
      }
      toast("Notas liberadas para os alunos.");
    } catch (e) {
      toast("Erro ao liberar: " + e.message, "erro");
    }
    telaEntregas(id);
  });

  if (!comGab) return;
  for (const r of respostas) {
    let acertos = 0;
    for (let i = 0; i < ex.questoes.length; i++) {
      if (!gabRes[i]) continue;
      const { status } = await conferirSql(c, i, r.respostas?.[i]?.codigo?.sql);
      if (status === "igual" || status === "mesmas-linhas") acertos++;
    }
    const el = document.getElementById(`auto-${r.codigo}`);
    if (el) {
      const cls = acertos === comGab ? "ok" : acertos === 0 ? "erro" : "alerta";
      el.innerHTML = `<span class="badge ${cls}">${acertos}/${comGab} iguais ao gabarito</span>`;
    }
  }
}

const ROTULO = {
  "igual": ["ok", "Igual ao gabarito ✓"],
  "mesmas-linhas": ["ok", "Mesmas linhas, ordem diferente"],
  "diferente": ["erro", "Diferente do gabarito"],
  "erro": ["erro", "Consulta com erro"],
  "branco": ["neutro", "Em branco"],
  "sem-gabarito": ["neutro", "Sem gabarito"],
};
const ROTULO_IA = {
  correta: ["ok", "IA: correta"],
  parcial: ["alerta", "IA: parcial"],
  incorreta: ["erro", "IA: incorreta"],
  em_branco: ["neutro", "IA: em branco"],
};

async function telaCorrecao(id, codigo) {
  carregando();
  const c = await carregarEntregas(id);
  const idx = c.respostas.findIndex((r) => r.codigo === codigo);
  if (idx < 0) throw new Error("Entrega não encontrada.");
  const r = c.respostas[idx];
  const ant = c.respostas[idx - 1], prox = c.respostas[idx + 1];
  const { ex } = c;
  const link = (x) => `#/entregas/${id}/${encodeURIComponent(x.codigo)}`;

  const htmlQ = (q, i) => {
    const resp = r.respostas?.[i] || {};
    const cod = resp.codigo || {};
    const testou = resp.testado ? '<span class="badge ok">Testou</span>' : '<span class="badge alerta">Não testou</span>';

    if (tipoDe(q) === "sql") {
      return `
      <section class="card">
        <div class="questao-topo"><h2>Questão ${i + 1} · SQL</h2>
          <div>${cod.sql?.trim() ? testou : ""}<span class="badge neutro" id="cmp-${i}">conferindo…</span></div></div>
        <div class="texto enunciado">${esc(q.enunciado)}</div>
        <div id="ia-q-${i}"></div>
        <pre class="codigo">${cod.sql?.trim() ? esc(cod.sql) : "(em branco)"}</pre>
        <div class="${c.gabRes[i] ? "grade-2" : ""}">
          <div><h3>Resultado do aluno</h3><div id="res-aluno-${i}"><p class="carregando">Executando…</p></div></div>
          ${c.gabRes[i] ? `<div><h3>Resultado esperado</h3>${htmlResultado(c.gabRes[i], 50)}
            <details><summary class="meta">ver SQL do gabarito</summary><pre class="codigo">${esc(c.gab[i].sql)}</pre></details></div>` : ""}
        </div>
      </section>`;
    }

    const editaveis = ABAS.filter((a) => q.web[a].modo === "editavel");
    const temGab = editaveis.some((a) => c.gab[i]?.[a]?.trim());
    return `
      <section class="card">
        <div class="questao-topo"><h2>Questão ${i + 1} · ${editaveis.map((a) => NOME_ABA[a]).join(" + ")}</h2>
          <div>${testou}${resp.comErro ? '<span class="badge erro">Deu erro no teste</span>' : ""}</div></div>
        <div class="texto enunciado">${esc(q.enunciado)}</div>
        <div id="ia-q-${i}"></div>
        ${editaveis.map((a) => `<div class="codigo-rotulo">${NOME_ABA[a]} do aluno</div>
          <pre class="codigo">${cod[a]?.trim() ? esc(cod[a]) : "(em branco)"}</pre>`).join("")}
        <div class="${temGab ? "grade-2" : ""}">
          <div><h3>Página do aluno</h3><div id="web-aluno-${i}"></div></div>
          ${temGab ? `<div><h3>Página do gabarito</h3><div id="web-gab-${i}"></div></div>` : ""}
        </div>
      </section>`;
  };

  app.innerHTML = `
    <div class="titulo-pagina">
      <div>
        <a href="#/entregas/${id}" class="voltar">← Entregas de “${esc(ex.titulo)}”</a>
        <h1>${esc(r.nome || "(sem nome)")}</h1>
        <p class="meta">Código ${esc(r.codigo)} · entregue em ${formatarData(r.enviadoEm)} · aluno ${idx + 1} de ${c.respostas.length}</p>
      </div>
      <div class="ex-acoes">
        ${ant ? `<a class="botao secundario" href="${link(ant)}">← Anterior</a>` : ""}
        ${prox ? `<a class="botao secundario" href="${link(prox)}">Próximo →</a>` : ""}
      </div>
    </div>
    ${r.entregueSemTeste ? '<div class="alerta">Este aluno confirmou a entrega sem testar todas as questões.</div>' : ""}
    <div id="aviso-reenvio"></div>

    ${ex.questoes.map(htmlQ).join("")}

    <section class="card correcao">
      <div class="questao-topo"><h2>Correção</h2><span id="c-situacao"></span></div>
      <div class="ia-box" id="ia-box"></div>
      <label class="campo curto">Nota<input type="number" id="c-nota" min="0" max="10" step="0.1"></label>
      <label class="campo">Feedback para o aluno <span class="meta">(ele vê só depois que você liberar)</span>
        <textarea id="c-coment" rows="4"></textarea></label>
      <div class="linha-botoes">
        <button class="primario" id="btn-liberar-c">Liberar para o aluno</button>
        ${prox ? '<button class="secundario" id="btn-liberar-prox">Liberar e ir para o próximo</button>' : ""}
        <button class="secundario" id="btn-rascunho" ${c.correcoes ? "" : "disabled"}>Salvar rascunho</button>
      </div>
    </section>`;

  const $ = (s) => document.getElementById(s);

  function preencher(forcarCampos) {
    const s = situacao(c, r);
    $("c-situacao").innerHTML = s.tipo === "liberada"
      ? `<span class="badge ok">Liberada em ${formatarData(r.corrigidoEm)} — o aluno já vê</span>`
      : s.tipo === "rascunho" ? '<span class="badge alerta">Rascunho — o aluno ainda não vê</span>'
      : '<span class="badge neutro">Sem correção</span>';
    $("aviso-reenvio").innerHTML = s.desatualizada
      ? '<div class="alerta">O aluno reenviou depois desta correção. Revise (ou gere a correção com IA de novo) antes de liberar.</div>' : "";
    $("btn-liberar-c").textContent = s.tipo === "liberada" ? "Atualizar nota liberada" : "Liberar para o aluno";

    if (forcarCampos) {
      const fonte = s.tipo === "rascunho" ? { nota: s.cor.nota, txt: s.cor.feedback } : { nota: r.nota, txt: r.comentario };
      $("c-nota").value = fonte.nota ?? "";
      $("c-coment").value = fonte.txt || "";
    }

    const cor = c.correcoes?.[r.codigo];
    const iaCor = cor?.questoes?.length ? cor : null;
    ex.questoes.forEach((_, i) => {
      const el = $(`ia-q-${i}`);
      const q = iaCor?.questoes?.[i];
      if (!el) return;
      if (!q?.comentario && !q?.situacao) { el.innerHTML = ""; return; }
      const [cls, txt] = ROTULO_IA[q.situacao] || ["neutro", "IA"];
      el.innerHTML = `<div class="ia-coment"><span class="badge ${cls}">${txt}</span> ${esc(q.comentario)}</div>`;
    });

    const semRegras = c.correcoes === null;
    $("ia-box").innerHTML = semRegras
      ? '<p class="meta">Publique as regras mais recentes do Firestore para usar a correção com IA.</p>'
      : `<div class="ia-linha">
          <button class="secundario" id="btn-ia">🤖 ${iaCor ? "Corrigir com IA de novo" : "Corrigir com IA"}</button>
          <span class="meta">${iaCor ? `Sugestão gerada por ${esc(iaCor.modelo || "IA")}${iaCor.origem === "professor" ? ", editada por você" : ""}.` : "A IA preenche a nota e o feedback abaixo; você revisa antes de liberar."}</span>
        </div>`;
    $("btn-ia")?.addEventListener("click", gerarIA);
  }

  async function gerarIA() {
    if (!(await garantirIA())) return;
    const cor = c.correcoes?.[r.codigo];
    if (cor?.origem === "professor" && !cor.liberada && !(await confirmar({
      titulo: "Substituir seu rascunho?", html: "<p>A sugestão da IA vai substituir a nota e o feedback que você editou.</p>", ok: "Substituir",
    }))) return;
    const btn = $("btn-ia");
    btn.disabled = true; btn.textContent = "🤖 Corrigindo…";
    try {
      await corrigirEntregaIA(c, r, (seg) => {
        btn.textContent = seg > 0 ? `🤖 Limite da IA atingido — tentando em ${seg}s…` : "🤖 Corrigindo…";
      });
      toast("Sugestão da IA pronta. Revise e libere.");
      preencher(true);
    } catch (e) {
      console.error(e);
      toast("Erro na IA: " + e.message, "erro");
      btn.disabled = false; btn.textContent = "🤖 Corrigir com IA";
    }
  }

  function lerCampos() {
    const v = $("c-nota").value;
    if (v === "") { toast("Informe a nota.", "erro"); return null; }
    const nota = Number(v);
    if (!(nota >= 0 && nota <= 10)) { toast("A nota vai de 0 a 10.", "erro"); return null; }
    return { nota, feedback: $("c-coment").value.trim() };
  }

  async function salvarRascunho() {
    const f = lerCampos();
    if (!f) return;
    try {
      const dados = { nota: f.nota, feedback: f.feedback, origem: "professor", liberada: false, envioAvaliado: ms(r.enviadoEm), editadoEm: serverTimestamp() };
      await setDoc(doc(db, "exercicios", id, "correcoes", codigo), dados, { merge: true });
      c.correcoes[codigo] = { ...(c.correcoes[codigo] || {}), ...dados };
      toast("Rascunho salvo. O aluno ainda não vê.");
      preencher(false);
    } catch (e) {
      toast("Erro ao salvar: " + e.message, "erro");
    }
  }

  async function liberar(irProximo) {
    const f = lerCampos();
    if (!f) return;
    try {
      const batch = writeBatch(db);
      if (c.correcoes) liberarNoLote(batch, c, codigo, f.nota, f.feedback, { envioAvaliado: ms(r.enviadoEm) });
      else batch.update(doc(db, "exercicios", id, "respostas", codigo), { nota: f.nota, comentario: f.feedback, corrigidoEm: serverTimestamp() });
      await batch.commit();
      if (c.correcoes) { aplicarLiberacaoLocal(c, r, f.nota, f.feedback); c.correcoes[codigo].envioAvaliado = ms(r.enviadoEm); }
      else Object.assign(r, { nota: f.nota, comentario: f.feedback, corrigidoEm: { toMillis: () => Date.now(), toDate: () => new Date() } });
      toast("Nota e feedback liberados para o aluno.");
      if (irProximo && prox) location.hash = link(prox);
      else preencher(false);
    } catch (e) {
      toast("Erro ao liberar: " + e.message, "erro");
    }
  }

  $("btn-rascunho").onclick = salvarRascunho;
  $("btn-liberar-c").onclick = () => liberar(false);
  $("btn-liberar-prox")?.addEventListener("click", () => liberar(true));
  preencher(true);

  // Páginas web: o código do aluno roda isolado, sem acesso à sua sessão de professor
  ex.questoes.forEach((q, i) => {
    if (tipoDe(q) !== "web") return;
    renderPreview($(`web-aluno-${i}`), codigoCompleto(q.web, r.respostas?.[i]?.codigo || {}));
    const elGab = $(`web-gab-${i}`);
    if (elGab) renderPreview(elGab, codigoCompleto(q.web, c.gab[i] || {}));
  });

  for (let i = 0; i < ex.questoes.length; i++) {
    if (tipoDe(ex.questoes[i]) !== "sql") continue;
    const { status, res, erro } = await conferirSql(c, i, r.respostas?.[i]?.codigo?.sql);
    const elRes = $(`res-aluno-${i}`);
    const elCmp = $(`cmp-${i}`);
    if (!elRes) return; // saiu da tela
    elRes.innerHTML = erro ? `<div class="erro-sql">${esc(erro)}</div>`
      : res ? htmlResultado(res, 50) : '<p class="info">Sem resposta.</p>';
    const [cls, txt] = ROTULO[status] || ["neutro", status];
    elCmp.className = "badge " + cls;
    elCmp.textContent = txt;
  }
}
