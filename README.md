# Avaliação de Apresentações: passo a passo

Site estático (GitHub Pages) que guarda as avaliações no Firebase (Firestore).
Cada aluno entra com um código pessoal e só pode avaliar cada grupo **uma vez**.

Arquivos:

| Arquivo | Para que serve |
| --- | --- |
| `index.html` | O site inteiro (ficha do aluno e área do professor) |
| `firebase-config.js` | Chaves do seu projeto Firebase (você preenche) |
| `firestore.rules` | Regras de segurança (você cola no Firebase) |

## 1. Criar o projeto no Firebase (uns 10 minutos)

1. Acesse https://console.firebase.google.com e clique em **Criar um projeto**. Dê um nome (ex.: `avaliacao-turma`). Pode desativar o Google Analytics.
2. No menu **Criação** > **Firestore Database** > **Criar banco de dados**.
   - Local: `southamerica-east1` (São Paulo).
   - Modo: **produção** (as regras do passo 3 liberam só o necessário).
3. Ainda no Firestore, aba **Regras**: apague tudo, cole o conteúdo de `firestore.rules` e **troque `SEU_EMAIL_AQUI@gmail.com` pelo seu e-mail Google** (o mesmo que usará para entrar como professor). Clique em **Publicar**.
4. Menu **Criação** > **Authentication** > **Vamos começar** > aba **Sign-in method** > **Google** > ativar e salvar (escolha seu e-mail como e-mail de suporte).
5. Engrenagem (**Configurações do projeto**) > **Seus apps** > ícone **</>** (Web) > dê um apelido e registre o app (não precisa de Hosting). Copie o bloco `firebaseConfig` mostrado e cole os valores em `firebase-config.js`.

## 2. Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie `index.html` e `firebase-config.js` (os outros arquivos são opcionais).
2. No repositório: **Settings** > **Pages** > **Deploy from a branch** > branch `main`, pasta `/ (root)` > Save.
3. Em alguns minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.
4. Volte ao Firebase: **Authentication** > **Settings** > **Authorized domains** > **Add domain** e adicione `SEU-USUARIO.github.io` (sem `https://` e sem o nome do repositório). Sem isso o login do professor não funciona.

## 3. Cadastrar a turma (antes da aula)

1. Abra o site e toque em **Sou o professor** > **Entrar com Google**.
2. Aba **Alunos e códigos**: cole os nomes (um por linha) e clique em **Gerar códigos**.
3. Entregue os códigos: **Imprimir cartões** (um cartão recortável por aluno, com o endereço do site) ou **Baixar códigos (CSV)** para enviar por mensagem.

## 4. Testar antes de usar

1. Entre como um aluno de teste (cadastre "Teste" na lista), avalie um grupo e confira a aba **Resultados**.
2. Tente avaliar o mesmo grupo de novo: o site deve recusar.
3. Apague os dados de teste no console do Firebase (Firestore > `alunos` > documento "Teste" e a subcoleção `avaliacoes`) ou deixe e ignore.

## Durante a aula

- Aluno: abre o link no celular, digita o código (fica salvo no aparelho) e avalia. O grupo é digitado pelo aluno. "Grupo 7", "g7" e "7" contam como o mesmo grupo.
- Professor: aba **Resultados** mostra médias por grupo, por critério, comentários, quantos alunos já avaliaram, e permite baixar CSV. Na aba **Alunos e códigos** a coluna "Avaliações enviadas" em vermelho mostra quem ainda não avaliou ninguém.

## Como o bloqueio funciona

- Cada avaliação é gravada em `alunos/{código}/avaliacoes/{grupo}`. O nome do documento é o grupo (normalizado).
- As regras do Firebase só permitem **criar** esse documento, nunca alterar. Portanto uma segunda tentativa para o mesmo grupo é recusada pelo servidor, mesmo que o aluno mexa no site.
- As regras também conferem o código, o nome do aluno, as notas (1 a 5) e o total.

## Limites que vale conhecer

- Se o aluno escrever o mesmo grupo de forma muito diferente ("Os Inovadores" e "Inovadores"), o sistema entende como grupos distintos. Na página de resultados você enxerga os dois e pode somar na mão, ou peça aos alunos para usar o número do grupo.
- O código é o que identifica o aluno: quem souber o código de um colega pode avaliar no nome dele. Peça para não compartilharem.
- Enviou errado? Só você consegue corrigir, apagando o documento da avaliação no console do Firebase (o aluno pode então enviar de novo).
- Os valores de `firebase-config.js` ficam visíveis no site. Isso é normal no Firebase; a proteção são as regras do passo 1.3.
- O plano gratuito do Firebase cobre com folga 40 alunos avaliando 20 grupos.
