// Funções compartilhadas entre a página do aluno e o painel do professor
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, query, limit, getDocs } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

// ---------- Firebase ----------
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);
export const onUser = (cb) => onAuthStateChanged(auth, cb);
// Pergunta ao Firestore: só o professor pode listar os exercícios (regra em firestore.rules).
// Assim o e-mail do professor não precisa ficar no código público do site.
export async function ehProfessor(u) {
  if (!u) return false;
  try {
    await getDocs(query(collection(db, "exercicios"), limit(1)));
    return true;
  } catch (e) {
    if (e.code === "permission-denied") return false;
    throw e;
  }
}

// Código do aluno: só letras e números, maiúsculas (igual ao site de avaliação)
export const normCode = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// ---------- Utilidades de interface ----------
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function formatarData(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function renderUsuario(el, u) {
  if (!el) return;
  if (!u) { el.innerHTML = ""; return; }
  el.innerHTML = `
    ${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" class="avatar" referrerpolicy="no-referrer">` : ""}
    <span class="nome-usuario">${esc(u.displayName || u.email)}</span>
    <button class="link" id="btn-sair">Sair</button>`;
  el.querySelector("#btn-sair").onclick = () => logout();
}

export function toast(msg, tipo = "ok") {
  let c = document.getElementById("toasts");
  if (!c) { c = document.createElement("div"); c.id = "toasts"; document.body.appendChild(c); }
  const t = document.createElement("div");
  t.className = "toast " + tipo;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

// Janela de confirmação. Resolve true (confirmou) ou false.
export function confirmar({ titulo, html, ok = "Confirmar", cancelar = "Cancelar", perigo = false }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "modal";
    d.innerHTML = `
      <h2>${esc(titulo)}</h2>
      <div class="modal-corpo">${html}</div>
      <div class="modal-acoes">
        ${cancelar ? `<button class="secundario" value="n">${esc(cancelar)}</button>` : ""}
        <button class="${perigo ? "perigo" : "primario"}" value="s">${esc(ok)}</button>
      </div>`;
    d.addEventListener("click", (e) => {
      const b = e.target.closest("button[value]");
      if (b) d.close(b.value);
    });
    d.addEventListener("close", () => { resolve(d.returnValue === "s"); d.remove(); });
    document.body.appendChild(d);
    d.showModal();
  });
}

// Editor simples: Tab insere espaços, Ctrl/Cmd+Enter executa
export function prepararEditor(textarea, aoExecutar) {
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !e.shiftKey && !textarea.readOnly) {
      e.preventDefault();
      textarea.setRangeText("  ", textarea.selectionStart, textarea.selectionEnd, "end");
      textarea.dispatchEvent(new Event("input"));
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      aoExecutar?.();
    }
  });
}

// ---------- Motor SQL (SQLite no navegador via sql.js) ----------
const SQLJS_CDN = "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/";
let sqlPromise = null;
function carregarSqlJs() {
  if (!sqlPromise) {
    if (typeof window.initSqlJs !== "function") {
      return Promise.reject(new Error("Não foi possível carregar o motor SQL (sql.js). Verifique a internet."));
    }
    sqlPromise = window.initSqlJs({ locateFile: (f) => SQLJS_CDN + f });
  }
  return sqlPromise;
}

// Ajusta trechos comuns de scripts MySQL/PostgreSQL que o SQLite não entende.
// Aplicado só ao DDL/DML do professor, nunca ao código do aluno.
export function adaptarSql(sql = "") {
  return sql
    .replace(/^\s*USE\s+[^;]*;/gim, "")
    .replace(/^\s*SET\s+(FOREIGN_KEY_CHECKS|NAMES|SQL_MODE|SQL_SAFE_UPDATES|AUTOCOMMIT|TIME_ZONE|CHARACTER_SET\w*|@\w+)\b[^;]*;/gim, "")
    .replace(/^\s*(CREATE|DROP)\s+(DATABASE|SCHEMA)\b[^;]*;/gim, "")
    .replace(/\)\s*ENGINE\s*=[^;]*;/gi, ");")
    .replace(/\bAUTO_INCREMENT\s*=\s*\d+/gi, "")
    .replace(/\bAUTO_INCREMENT\b/gi, "")
    .replace(/\bUNSIGNED\b/gi, "")
    .replace(/\b(BIG)?SERIAL\b/gi, "INTEGER")
    .replace(/\b(DEFAULT\s+)?CHARACTER\s+SET\s+\w+/gi, "")
    .replace(/\b(DEFAULT\s+)?CHARSET\s*=?\s*\w+/gi, "")
    .replace(/\bCOLLATE\s*=?\s*\w+/gi, "");
}

export async function criarBanco(ddl, dml) {
  const SQL = await carregarSqlJs();
  const banco = new SQL.Database();
  try { banco.exec(adaptarSql(ddl)); }
  catch (e) { banco.close(); throw new Error("Erro ao criar as tabelas (DDL): " + e.message); }
  if (dml && dml.trim()) {
    try { banco.exec(adaptarSql(dml)); }
    catch (e) { banco.close(); throw new Error("Erro ao inserir os dados (DML): " + e.message); }
  }
  return banco;
}

// Cria um banco novo a partir do DDL+DML, roda a consulta e devolve o
// resultado do último comando que retornou colunas.
export async function executarConsulta(ddl, dml, consulta) {
  const banco = await criarBanco(ddl, dml);
  try {
    let resultado = null;
    let afetadas = 0;
    const t0 = performance.now();
    for (const stmt of banco.iterateStatements(consulta)) {
      const colunas = stmt.getColumnNames();
      const linhas = [];
      while (stmt.step()) linhas.push(stmt.get());
      if (colunas.length) resultado = { colunas, linhas };
      else afetadas += banco.getRowsModified();
    }
    const ms = performance.now() - t0;
    if (!resultado) resultado = { colunas: [], linhas: [], semSelect: true, afetadas };
    resultado.ms = ms;
    return resultado;
  } finally {
    banco.close();
  }
}

export async function estruturaBanco(ddl, dml) {
  const banco = await criarBanco(ddl, dml);
  try {
    const nomes = (banco.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )[0]?.values || []).map((r) => r[0]);
    return nomes.map((nome) => {
      const q = '"' + String(nome).replace(/"/g, '""') + '"';
      const colunas = (banco.exec(`PRAGMA table_info(${q})`)[0]?.values || [])
        .map((r) => ({ nome: r[1], tipo: r[2] || "", pk: r[5] > 0 }));
      const fks = (banco.exec(`PRAGMA foreign_key_list(${q})`)[0]?.values || [])
        .map((r) => ({ tabela: r[2], de: r[3], para: r[4] }));
      const total = banco.exec(`SELECT COUNT(*) FROM ${q}`)[0].values[0][0];
      return { nome, colunas, fks, total };
    });
  } finally {
    banco.close();
  }
}

// Compara dois resultados: 'igual' | 'mesmas-linhas' (ordem diferente) | 'diferente'
export function compararResultados(a, b) {
  if (!a || !b) return "indisponivel";
  if (a.colunas.length !== b.colunas.length) return "diferente";
  const norm = (r) => r.linhas.map((l) =>
    JSON.stringify(l.map((v) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v))));
  const x = norm(a), y = norm(b);
  if (x.length !== y.length) return "diferente";
  if (x.every((v, i) => v === y[i])) return "igual";
  const sx = [...x].sort(), sy = [...y].sort();
  return sx.every((v, i) => v === sy[i]) ? "mesmas-linhas" : "diferente";
}

export function htmlResultado(r, limite = 200) {
  if (r.semSelect) {
    return `<p class="info">Comando executado sem retornar linhas${r.afetadas ? ` (${r.afetadas} linha(s) afetada(s))` : ""}.</p>`;
  }
  const cab = r.colunas.map((c) => `<th>${esc(c)}</th>`).join("");
  const corpo = r.linhas.slice(0, limite).map((l) =>
    "<tr>" + l.map((v) => (v === null ? '<td class="nulo">NULL</td>' : `<td>${esc(v)}</td>`)).join("") + "</tr>"
  ).join("");
  const vazio = `<tr><td colspan="${r.colunas.length || 1}" class="vazio">Nenhuma linha retornada</td></tr>`;
  const rodape = `${r.linhas.length} linha(s)` +
    (r.linhas.length > limite ? ` — exibindo as ${limite} primeiras` : "") +
    (r.ms != null ? ` · ${r.ms.toFixed(1)} ms` : "");
  return `<div class="tabela-wrap"><table class="resultado"><thead><tr>${cab}</tr></thead>
    <tbody>${corpo || vazio}</tbody></table></div><p class="rodape-res">${rodape}</p>`;
}

export function htmlEstrutura(tabelas, comBotaoVer = false) {
  if (!tabelas.length) return '<p class="info">Nenhuma tabela encontrada no DDL.</p>';
  return `<div class="tabelas">${tabelas.map((t) => `
    <div class="tabela-card">
      <div class="tabela-nome">${esc(t.nome)} <span class="contagem">${t.total} linha(s)</span></div>
      <ul>${t.colunas.map((c) => {
        const fk = t.fks.find((f) => f.de === c.nome);
        return `<li>
          ${c.pk ? '<span class="pk" title="Chave primária">PK</span>' : ""}
          ${fk ? '<span class="fk" title="Chave estrangeira">FK</span>' : ""}
          <span class="col">${esc(c.nome)}</span>
          <span class="tipo">${esc(c.tipo)}</span>
          ${fk ? `<span class="ref">→ ${esc(fk.tabela)}${fk.para ? "." + esc(fk.para) : ""}</span>` : ""}
        </li>`;
      }).join("")}</ul>
      ${comBotaoVer ? `<button class="link" data-ver="${esc(t.nome)}">Ver dados</button>` : ""}
    </div>`).join("")}</div>`;
}

// ---------- Questões de HTML / CSS / JavaScript ----------
export const ABAS = ["html", "css", "js"];
export const NOME_ABA = { html: "HTML", css: "CSS", js: "JavaScript" };
export const MODOS = { editavel: "Aluno edita", travado: "Visível, só leitura", oculto: "Oculto (só entra na página)" };

// Modelos rápidos para o professor
export const MODELOS_WEB = {
  html: { html: "editavel", css: "oculto", js: "oculto" },
  css: { html: "travado", css: "editavel", js: "oculto" },
  js: { html: "travado", css: "oculto", js: "editavel" },
  completo: { html: "editavel", css: "editavel", js: "editavel" },
};

export function webPadrao() {
  return {
    html: { modo: "editavel", inicial: "" },
    css: { modo: "oculto", inicial: "" },
    js: { modo: "oculto", inicial: "" },
  };
}

// Junta o código do aluno (abas editáveis) com o código fornecido pelo professor
export function codigoCompleto(web, codigoAluno = {}) {
  const r = {};
  for (const a of ABAS) {
    const cfg = web?.[a] || { modo: "oculto", inicial: "" };
    r[a] = cfg.modo === "editavel" ? (codigoAluno[a] ?? "") : (cfg.inicial || "");
  }
  return r;
}

// Monta o documento que roda dentro do iframe isolado
export function montarPagina({ html = "", css = "", js = "" }, canal) {
  const seguroJs = js.replace(/<\/script/gi, "<\\/script");
  const seguroCss = css.replace(/<\/style/gi, "<\\/style");
  const captura = `<script>(function(){var C=${JSON.stringify(canal)},OFF=__OFF__;` +
    `function f(v){try{if(v instanceof Error)return v.name+': '+v.message;if(v===undefined)return 'undefined';if(typeof v==='object'&&v!==null)return JSON.stringify(v);return String(v)}catch(e){return String(v)}}` +
    `function env(n,a){try{parent.postMessage({__ex:C,nivel:n,texto:Array.prototype.map.call(a,f).join(' ')},'*')}catch(e){}}` +
    `['log','info','warn','error'].forEach(function(n){var o=console[n];console[n]=function(){env(n,arguments);if(o)o.apply(console,arguments)}});` +
    `window.addEventListener('error',function(e){var l=e.lineno;env('erro',[e.message+(l?(OFF&&l>OFF?' (linha '+(l-OFF)+' do JavaScript)':' (linha '+l+')'):'')])});` +
    `window.addEventListener('unhandledrejection',function(e){env('erro',['Promise rejeitada: '+f(e.reason)])});})();</script>`;
  const headExtra = '<meta charset="utf-8">' + captura + (css.trim() ? `<style>\n${seguroCss}\n</style>` : "");
  const jsTag = js.trim() ? `<script>\n${seguroJs}\n</script>` : "";

  let doc;
  const reHead = /<head(\s[^>]*)?>/i, reHtml = /<html(\s[^>]*)?>/i;
  if (reHtml.test(html) || /<!doctype/i.test(html)) {
    if (reHead.test(html)) doc = html.replace(reHead, (m) => m + headExtra);
    else if (reHtml.test(html)) doc = html.replace(reHtml, (m) => m + "<head>" + headExtra + "</head>");
    else doc = headExtra + html;
    doc = /<\/body>/i.test(doc)
      ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => jsTag + "</body>")
      : doc + jsTag;
  } else {
    doc = `<!doctype html><html><head>${headExtra}</head><body>\n${html}\n${jsTag}</body></html>`;
  }
  // Linha onde começa o JS do aluno, para mostrar o número de linha certo nos erros
  let off = 0;
  if (jsTag) off = doc.slice(0, doc.lastIndexOf(jsTag)).split("\n").length;
  return doc.replace("__OFF__", String(off));
}

const ouvintes = new Map();
let contadorCanal = 0;
window.addEventListener("message", (e) => {
  const d = e.data;
  const o = d && typeof d.__ex === "string" && ouvintes.get(d.__ex);
  if (o && e.source === o.iframe.contentWindow) o.fn(d);
});

// Mostra a página do aluno num iframe isolado (sem acesso ao login nem aos dados do site)
// e um console com os console.log e os erros.
export function renderPreview(container, codigo, { aoErro, altura = 300 } = {}) {
  if (container.__canal) ouvintes.delete(container.__canal);
  const canal = "c" + ++contadorCanal + Math.random().toString(36).slice(2, 8);
  container.__canal = canal;
  container.innerHTML = `
    <div class="preview-frame"><iframe sandbox="allow-scripts allow-modals" title="Pré-visualização" style="height:${altura}px"></iframe></div>
    <div class="console"><div class="console-topo">Console</div><div class="console-linhas"><span class="console-vazio">(nada no console)</span></div></div>`;
  const iframe = container.querySelector("iframe");
  const linhas = container.querySelector(".console-linhas");
  let vazio = true;
  ouvintes.set(canal, {
    iframe,
    fn: (d) => {
      if (vazio) { linhas.innerHTML = ""; vazio = false; }
      const div = document.createElement("div");
      div.className = "cl " + d.nivel;
      div.textContent = (d.nivel === "erro" ? "✖ " : d.nivel === "warn" ? "⚠ " : "") + d.texto;
      linhas.appendChild(div);
      if (d.nivel === "erro") aoErro?.(d.texto);
    },
  });
  iframe.srcdoc = montarPagina(codigo, canal);
}
