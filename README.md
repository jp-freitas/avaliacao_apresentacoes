# Exercícios (SQL, HTML, CSS e JavaScript): passo a passo

Site estático (GitHub Pages) que usa o **mesmo projeto Firebase do site de avaliação**.
Os alunos entram com o **mesmo código pessoal** (coleção `alunos`), e você entra com o Google.

- **Aluno** (`index.html?ex=ID`): digita o código, faz as questões, clica em **▶ Executar** para testar e **entrega**. Se tentar entregar sem testar, aparece a confirmação *"Você não testou a questão X… Deseja entregar mesmo assim?"*. Pode reenviar enquanto o exercício estiver aberto.
- **Professor** (`professor.html`): cria exercícios, copia o link, encerra ou reabre, vê quem entregou e quem não entregou, corrige com nota e comentário. O aluno vê a nota e o comentário quando abre o exercício de novo.

## Tipos de questão

| Tipo | O aluno vê | Correção |
|---|---|---|
| **SQL** | as tabelas do banco (do seu DDL + DML), um editor SQL e a tabela de resultado | automática: compara com o resultado do gabarito |
| **HTML / CSS / JS** | abas de código, a página renderizada e um console com `console.log` e erros (com o número da linha) | visual: a página do aluno ao lado da página do gabarito, junto com o código |

Em cada questão de HTML/CSS/JS você escolhe, para cada aba, se ela é **editável pelo aluno**, **visível só para leitura** ou **oculta**, e qual é o código inicial. Os botões de modelo rápido já deixam tudo pronto:

- **Exercício de HTML**: o aluno edita o HTML.
- **Exercício de CSS**: o HTML vem pronto (travado) e o aluno escreve o CSS.
- **Exercício de JS**: o HTML vem pronto e o aluno escreve o JavaScript.

Dá para misturar questões de SQL e de HTML/CSS/JS no mesmo exercício.

## Arquivos

```
site/                         → o que vai para o GitHub Pages
  index.html                  → página do aluno
  professor.html              → painel do professor
  js/config.js                → seu projeto Firebase (já preenchido)
  js/common.js, aluno.js, professor.js
  js/ia.js                    → correção com IA (só o painel do professor usa)
  css/style.css
firestore.rules               → regras completas (as atuais + exercícios), prontas para colar
exemplo/ddl.sql, dml.sql      → banco de exemplo (clientes × pedidos)
```

## 1. Regras do Firestore (2 minutos)

O arquivo `firestore.rules` já é a **junção das suas regras atuais com as dos exercícios**: as regras de `alunos` e `avaliacoes` estão idênticas, e o bloco de `exercicios` foi acrescentado no fim, usando a mesma função `professor()`.

1. Console do Firebase → **Firestore Database** → aba **Regras**.
2. Apague tudo, cole o conteúdo de `firestore.rules` e clique em **Publicar**.

O site de avaliação continua funcionando igual.

## 2. Configuração

Nada a fazer: `site/js/config.js` já está com o seu projeto. O seu e-mail **não** fica no site, que é público no GitHub Pages. O painel pergunta ao Firestore se a conta conectada é a de professor, e quem decide isso é a função `professor()` das regras.

## 3. Publicar no GitHub Pages

1. Crie um **repositório novo** (ex.: `exercicios`) e envie **o conteúdo da pasta `site/`** (`index.html` precisa ficar na raiz do repositório).
2. **Settings** → **Pages** → **Deploy from a branch** → `main` / `(root)` → Save.
3. O site fica em `https://SEU-USUARIO.github.io/exercicios/`.
4. O domínio `SEU-USUARIO.github.io` já está autorizado no Firebase (você fez isso para o site de avaliação), então o login do professor já funciona.

> Use um repositório separado. Se colocar estes arquivos no mesmo repositório do site de avaliação, o `index.html` de um substitui o do outro.

## 4. Primeiro uso

1. Abra `https://SEU-USUARIO.github.io/exercicios/professor.html` e entre com o Google.
2. **+ Novo exercício**. Para testar rápido com SQL, envie `exemplo/ddl.sql` e `exemplo/dml.sql`.
3. Ao salvar, o painel mostra o link para enviar aos alunos.
4. Para ver como o aluno vê, use **Abrir como aluno** com o código de um aluno de teste (cadastre um "Teste" no site de avaliação).

## Segurança, em resumo

- **Código do aluno**: as regras conferem se o código existe em `alunos` e se o nome enviado é o do cadastro. Ninguém consegue listar os códigos nem as entregas, só o professor. Como no site de avaliação, quem souber o código de um colega pode entregar no nome dele, então peça para não compartilharem.
- **Gabarito**: fica em `exercicios/{id}/privado/gabarito` e só o professor lê.
- **Nota**: só o professor grava `nota`, `comentario` e `corrigidoEm`.
- **Prazo**: quando você clica em **Encerrar**, o servidor recusa novas entregas.
- **JavaScript do aluno**: roda num iframe isolado, sem acesso ao site, ao login ou ao Firestore. Isso vale também quando você abre a entrega para corrigir, então um aluno não consegue usar o próprio código para mexer na nota.

## Observações

- **SQL**: o motor é SQLite rodando no navegador. Scripts MySQL comuns são ajustados automaticamente (`ENGINE`, `AUTO_INCREMENT`, `CHARSET`, `UNSIGNED`, `USE`, `CREATE DATABASE`). Funções próprias do MySQL, como `DATE_FORMAT`, não existem no SQLite. Use **Testar banco** e **Testar gabarito** antes de liberar.
- **Conferência SQL**: "mesmas linhas, ordem diferente" conta como acerto. Se a ordem importar, confira manualmente.
- **Editar um exercício com entregas**: evite remover ou reordenar questões, porque as respostas são guardadas pela posição.
- **Loop infinito** no JS do aluno pode travar a aba da pré-visualização. Basta recarregar a página.

## Tipo do exercício

Ao criar um exercício, escolha **Banco de Dados** ou **HTML, CSS e JavaScript**. Os campos do banco (DDL e DML) só aparecem no tipo Banco de Dados.

## Correção com IA

1. Crie uma chave de API:
   - **Groq** (gratuito, sem cartão, não treina com os dados): https://console.groq.com/keys
   - **OpenRouter** (modelos gratuitos, até 50 correções por dia): https://openrouter.ai/settings/keys
   - **Google Gemini** (tem plano gratuito): https://aistudio.google.com/apikey
   - **Anthropic Claude** (pago por uso): https://console.anthropic.com/settings/keys
2. No painel, clique em **Configurar IA** e cole a chave. Ela fica salva **só neste navegador**; em outro computador, configure de novo.
3. Em **Ver entregas**, clique em **Corrigir com IA**. A IA sugere nota e feedback para cada entrega, e tudo fica como **rascunho**: o aluno não vê.
4. Revise em **Corrigir** (dá para mudar a nota e o texto) e clique em **Liberar para o aluno**, ou use **Liberar notas** para liberar todos os rascunhos de uma vez.

O que vai para a IA: enunciados, gabaritos, critérios e o código de cada aluno. Nomes e códigos de acesso dos alunos **não** são enviados.
No plano gratuito do Gemini e em alguns modelos gratuitos da OpenRouter, o conteúdo enviado pode ser usado para treinar os modelos. A Groq não treina com os dados enviados.

No formulário do exercício, o campo **Critérios para a correção com IA** (opcional, o aluno não vê) diz como dar a nota, por exemplo o peso de cada questão.

Se um aluno reenviar depois da correção, a entrega aparece com **reenviou após correção**, e o botão **Corrigir com IA** passa a incluí-la de novo.
