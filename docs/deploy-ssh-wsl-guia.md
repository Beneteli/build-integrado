# Guia de deploy: GitHub Actions + runner self-hosted + SSH (WSL Ubuntu)

Este documento registra o que foi configurado para o fluxo funcionar de ponta a ponta: repositório Git/GitHub, workflow, secrets, Linux (WSL), runner e SSH. Use como checklist ao repetir em outro ambiente.

---

## Bloco A — Repositório Git e GitHub

### A.1 Primeiro push e branches

- O workflow de deploy dispara **somente manualmente** (**workflow_dispatch**) na interface do GitHub Actions.

### A.2 Arquivo do workflow

- Caminho: `.github/workflows/deploy.yml`
- Conteúdo relevante (resumo):
  - `runs-on: self-hosted` — o job só roda em um runner registrado na sua máquina/rede.
  - Build com **npm**: `npm ci`, `npm run build` (é necessário `package-lock.json` no repositório).
  - Empacota `dist/` em `dist.tar.gz`.
  - Usa `webfactory/ssh-agent` com o secret `SSH_PRIVATE_KEY`.
  - Envia o pacote com `scp` e no servidor executa `ssh` para extrair em `$DEPLOY_PATH/current`.

### A.3 Por que não usar só runner hospedado da GitHub

- Runners `ubuntu-latest` da GitHub **não alcançam** IP privado da sua rede ou do WSL (`172.x`, etc.).
- Por isso o deploy neste cenário usa **`self-hosted`** na mesma máquina (ou na rede que enxerga o servidor SSH).

---

## Bloco B — Secrets e configuração no GitHub (Settings → Actions → Secrets)

Ordem de exibição na interface do GitHub **não importa**. Os nomes precisam bater com o workflow.

| Secret | Descrição | Exemplo no cenário validado (runner e sshd no mesmo WSL) |
|--------|-----------|-----------------------------------------------------------|
| `SSH_PRIVATE_KEY` | Chave privada OpenSSH **completa** (incluindo `BEGIN`/`END`). Corresponde à pública em `authorized_keys` no servidor. | Conteúdo de `~/.ssh/github_actions_deploy` |
| `SSH_USER` | Usuário Linux que recebe o deploy | `deploy` |
| `SSH_HOST` | Hostname ou IP onde o `sshd` escuta | `127.0.0.1` quando runner e servidor são o mesmo WSL |
| `SSH_PORT` | Porta SSH | `22` (ou a porta configurada no `sshd`) |
| `DEPLOY_PATH` | Diretório absoluto no Linux; o workflow grava `dist.tar.gz` aqui e extrai em `$DEPLOY_PATH/current` | `/home/deploy/app` |

### B.1 Disparar o workflow

- **Actions** → workflow **deploy** → **Run workflow** (único gatilho; não há deploy automático em push).

---

## Bloco C — Procedimentos no Linux (WSL Ubuntu 24.04)

Ambiente de referência: **Ubuntu 24.04** no WSL, usuário **`deploy`** para runner e para deploy via SSH.

### C.1 Usuário `deploy` e permissões do home

- Criar usuário se não existir (como root): `useradd -m -s /bin/bash deploy`
- Garantir dono correto do home (evita erros de `npm` e mensagens de MOTD):
  - `chown -R deploy:deploy /home/deploy`
- Cache do npm usado pelo job:
  - `mkdir -p /home/deploy/.npm`
  - `chown -R deploy:deploy /home/deploy/.npm`

### C.2 `sudo` para o usuário `deploy` (opcional, recomendado para manutenção)

Como root:

```bash
apt update && apt install -y sudo
usermod -aG sudo deploy
passwd deploy
```

### C.3 Servidor SSH (OpenSSH)

Instalar e iniciar (como root):

```bash
apt update
apt install -y openssh-server
mkdir -p /run/sshd
/usr/sbin/sshd -t
service ssh start
```

Verificar escuta na porta esperada (ex.: 22):

```bash
ss -tlnp | grep ':22'
```

### C.4 Autenticação por chave (obrigatória para o Actions)

O job **não** pode digitar senha. A autenticação deve ser **só por chave**.

Como usuário `deploy`:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -f ~/.ssh/github_actions_deploy -N "" -C "github-actions-deploy"
cat ~/.ssh/github_actions_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Colocar no GitHub o conteúdo **inteiro** da chave **privada** (`cat ~/.ssh/github_actions_deploy`) no secret `SSH_PRIVATE_KEY`.

Teste local (deve imprimir `ok` sem pedir senha):

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/github_actions_deploy
ssh -o PreferredAuthentications=publickey deploy@127.0.0.1 "echo ok"
```

Na primeira conexão interativa, o cliente pode pedir confirmação do fingerprint; digite a palavra **`yes`** completa.

### C.5 Diretório de deploy no disco

Alinhar com o secret `DEPLOY_PATH` (exemplo `/home/deploy/app`):

```bash
sudo mkdir -p /home/deploy/app/current
sudo chown -R deploy:deploy /home/deploy/app
```

Após um deploy bem-sucedido, o site estático fica em **`/home/deploy/app/current`** (`index.html`, `assets/`, etc.).

### C.6 Navegar pelos arquivos no WSL

No terminal:

```bash
cd /home/deploy/app/current
ls -la
```

No Windows Explorer:

```text
\\wsl$\Ubuntu-24.04\home\deploy\app\current
```

(Ajuste `Ubuntu-24.04` conforme `wsl -l -v`.)

---

## Bloco D — GitHub Actions Runner (self-hosted)

### D.1 Onde instalar

- Diretório típico: `/home/deploy/actions-runner`
- Dependências no Ubuntu: `curl`, `git`, `tar`, `bash`, `ca-certificates` (`apt install`).

### D.2 Baixar e registrar

Seguir a página **Settings → Actions → Runners → New self-hosted runner** (Linux x64), usando o token de configuração que o GitHub gera (expira rápido).

Exemplo de fluxo:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64-<VERSAO>.tar.gz -L <URL_DO_PACOTE>
tar xzf actions-runner-linux-x64-<VERSAO>.tar.gz
./config.sh --url https://github.com/<OWNER>/<REPO> --token <TOKEN>
./run.sh
```

### D.3 Usuário que executa o runner

- Rodar **`./run.sh` como usuário `deploy`**, não como `root`.
- Se aparecer `Must not run interactively with sudo`, você iniciou o runner com privilégios elevados; volte ao `deploy` e execute de novo.

### D.4 Mensagem “Runner listener exit with 0”

- Indica que o processo do runner **encerrou** (terminal fechou, Ctrl+C, ou fim normal). Para receber jobs, execute `./run.sh` de novo e deixe em execução com **Listening for Jobs**.

---

## Bloco E — Problemas comuns e correções

| Sintoma | Causa provável | Correção |
|---------|----------------|----------|
| `pnpm/action-setup` ou passos antigos no log | Workflow desatualizado no remoto | Garantir commit/push do `deploy.yml` com **npm** (`npm ci` / `npm run build`). |
| `npm error EACCES` em `~/.npm` | Cache ou home com arquivos do root | Como root: `chown -R deploy:deploy /home/deploy` e `/home/deploy/.npm`. |
| `ssh: Connection refused` | `sshd` parado ou porta errada | Instalar/iniciar `openssh-server`; conferir `SSH_PORT` e `ss -tlnp`. |
| `scp: Connection closed` / pedido de senha no Actions | Sem chave válida ou `authorized_keys` ausente | Gerar par de chaves, colocar `.pub` em `authorized_keys`, privada no secret; permissões `700` / `600` em `.ssh`. |
| `wsl: command not found` dentro do Linux | Comando só existe no Windows | Usar `wsl -d Ubuntu-24.04 -u root` no **PowerShell**, ou `su -` no Linux se tiver senha de root. |
| Runner sem `run.sh` (pasta vazia) | Diretório errado ou arquivos removidos | Extrair de novo o `.tar.gz` do runner e rodar `config.sh`. |

---

## Bloco F — Validação após deploy

1. No GitHub: job **deploy** com todos os passos verdes, em especial **Transferir pacote para Linux** e **Executar deploy remoto**.
2. No Linux:

```bash
ls -la /home/deploy/app/current
test -f /home/deploy/app/current/index.html && echo OK
stat /home/deploy/app/current/index.html
```

3. Exibir conteúdo no navegador exige um servidor HTTP (nginx, Caddy, etc.) com `root` apontando para `current`, ou um servidor de testes; o workflow apenas copia arquivos estáticos.

---

## Bloco G — Segurança (lembrete)

- Não commitar chaves privadas; usar só secrets do GitHub.
- Evitar compartilhar chaves em chat ou prints com texto completo.
- Em produção, preferir `known_hosts` e políticas SSH mais rígidas em vez de depender só de `StrictHostKeyChecking=no` no workflow.
- Usuário dedicado (`deploy`) em vez de `root` para arquivos do site e SSH.
