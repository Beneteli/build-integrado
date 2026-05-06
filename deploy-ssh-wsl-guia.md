# Guia de Deploy via GitHub Actions + SSH (WSL/Alpine)

Este documento resume o passo a passo do que foi feito, o que funcionou e os pontos de atencao para repetir o processo com seguranca.

## 1) Objetivo do fluxo

Configurar um workflow de deploy no GitHub Actions para:

1. Buildar o projeto.
2. Empacotar o `dist`.
3. Enviar para um Linux via SSH.
4. Extrair no destino e atualizar a aplicacao.

## 2) Estrategia adotada

- Workflow de deploy separado em `.github/workflows/deploy.yml`.
- Execucao manual (`workflow_dispatch`) e por `push` na branch de teste `feature/build-integrado`.
- Runner configurado para `self-hosted` por causa do IP privado do WSL (`172.25.x.x`), inacessivel por runners hospedados da GitHub.

## 3) Workflow de deploy criado

O `deploy.yml` ficou com esta logica:

1. `checkout` da branch alvo (`github.ref_name`).
2. Setup de ambiente (`pnpm` + `node 20`).
3. `pnpm install --frozen-lockfile`.
4. `pnpm lint`.
5. `pnpm build`.
6. Compactar `dist` em `dist.tar.gz`.
7. Iniciar agente SSH com `SSH_PRIVATE_KEY`.
8. Transferir pacote com `scp`.
9. Acessar servidor via `ssh`, extrair pacote e recarregar `pm2` (quando existir).

## 4) Secrets necessarios no GitHub

Configurados em `Settings > Secrets and variables > Actions`:

- `SSH_HOST`: host/IP do Linux (exemplo: `172.25.158.87`)
- `SSH_USER`: usuario remoto (recomendado `deploy`)
- `SSH_PORT`: porta SSH (normalmente `22`)
- `DEPLOY_PATH`: caminho absoluto no Linux (exemplo: `/home/deploy/app`)
- `SSH_PRIVATE_KEY`: conteudo completo da chave privada OpenSSH

## 5) Configuracao de SSH no Alpine (WSL)

### 5.1 Instalar SSH server

```sh
apk update
apk add openssh openssh-server
mkdir -p /run/sshd
ssh-keygen -A
/usr/sbin/sshd
```

### 5.2 Validar que a porta 22 esta ativa

```sh
netstat -lntp | grep ":22"
```

Resultado esperado: processo `sshd` em `LISTEN` na porta `22`.

### 5.3 Criar usuario dedicado para deploy

```sh
adduser -D deploy
su - deploy
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy -N ""
cat ~/.ssh/github_actions_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 5.4 Testar autenticacao por chave

```sh
ssh -i /home/deploy/.ssh/github_actions_deploy deploy@172.25.158.87
```

Na primeira conexao, confirmar com `yes`.

## 6) O que deu certo (validado)

- SSH server ativo no Alpine/WSL com escuta na porta `22`.
- Conexao SSH por chave funcionando.
- Workflow de deploy ajustado com build + envio por SSH.
- Build local do projeto executado com sucesso apos os ajustes de workflow.

## 7) Problemas encontrados e solucao

### Problema 1: `Connection refused` no SSH

- Causa: `sshd` nao estava ativo.
- Solucao: instalar e iniciar `openssh-server`, depois validar com `netstat`.

### Problema 2: tentativa de usar runner hospedado da GitHub com IP privado

- Causa: runner `ubuntu-latest` nao acessa rede privada local (`172.25.x.x`).
- Solucao: mudar `runs-on` para `self-hosted`.

### Problema 3: chave privada exposta durante teste

- Acao recomendada: revogar/remover a chave e gerar outra imediatamente.

## 8) Observacoes de seguranca

- Nao usar `root` em producao; preferir usuario dedicado (`deploy`).
- Nao compartilhar conteudo de chave privada em chat, logs ou repositorio.
- Em ambiente real, remover `StrictHostKeyChecking=no` e usar `known_hosts`.
- Usar caminho de deploy isolado para ambiente de teste.

## 9) Checklist rapido para repetir em outro repositorio

1. Criar `deploy.yml`.
2. Configurar `self-hosted runner` no repositorio.
3. Configurar os 5 secrets SSH.
4. Garantir `sshd` ativo no Linux de destino.
5. Validar login SSH por chave.
6. Rodar workflow manual no GitHub Actions.
7. Conferir arquivos extraidos em `DEPLOY_PATH/current`.

