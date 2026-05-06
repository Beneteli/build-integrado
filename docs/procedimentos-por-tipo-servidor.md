# Procedimentos de deploy por tipo de servidor

Este arquivo descreve **somente** o que fazer em cada cenário de servidor em relação ao workflow `.github/workflows/deploy.yml` (build, `scp`, `ssh`, extração em `DEPLOY_PATH/current`).

O passo a passo completo no WSL Ubuntu (usuário `deploy`, runner, chaves, `sshd`) está em **`deploy-ssh-wsl-guia.md`** na raiz do repositório.

---

## Pré-requisitos comuns a todos os tipos

1. Repositório com `package-lock.json` e workflow usando `npm ci` / `npm run build`.
2. No servidor de destino: usuário Linux (ex.: `deploy`), diretório `DEPLOY_PATH` gravável por esse usuário, OpenSSH com autenticação **por chave** (o Actions não digita senha).
3. Secrets no GitHub (**Settings → Secrets and variables → Actions**): `SSH_PRIVATE_KEY`, `SSH_USER`, `SSH_HOST`, `SSH_PORT`, `DEPLOY_PATH`.

---

## Tipo 1 — Servidor Linux na internet (IP ou DNS público) + runner hospedado GitHub

**Quando usar:** VPS, cloud com IP elástico, máquina com SSH acessível da internet.

**No `.github/workflows/deploy.yml`:** altere o job para `runs-on: ubuntu-latest` (ou outro runner hospedado) em vez de `self-hosted`.

**Procedimento**

1. No servidor Linux, instale e configure `openssh-server`; abra o firewall para a porta SSH (ex.: **22**) para origens da internet (veja política de segurança da equipe).
2. Crie usuário de deploy, pasta `DEPLOY_PATH`, e coloque a chave **pública** correspondente à privada do secret `SSH_PRIVATE_KEY` em `~/.ssh/authorized_keys`.
3. Nos secrets do GitHub:
   - `SSH_HOST` = IP público ou hostname que resolve na internet.
   - `SSH_PORT` = porta do `sshd`.
   - Demais secrets como no pré-requisitos.
4. Remova ou mantenha runner self-hosted conforme preferência; jobs com `ubuntu-latest` não usam o runner da sua máquina.
5. Dispare o workflow manualmente (**Actions → deploy → Run workflow**).

**Validação:** a partir de uma máquina na internet (não precisa ser a sua), teste `ssh -p PORTA usuario@HOST` com a mesma chave antes de confiar só no Actions.

---

## Tipo 2 — Servidor Linux na internet + runner self-hosted **no próprio servidor**

**Quando usar:** quer evitar expor SSH à internet só para a GitHub; o pipeline executa no mesmo host que recebe os arquivos.

**Procedimento**

1. No servidor, instale dependências (`curl`, `git`, `tar`, etc.) e registre o **GitHub Actions Runner** em uma pasta dedicada (ex.: `/home/deploy/actions-runner`), conforme *Settings → Actions → Runners → New self-hosted runner*.
2. No `.github/workflows/deploy.yml`, mantenha `runs-on: self-hosted` (e labels se usar).
3. No mesmo servidor: `sshd` ativo; usuário e `DEPLOY_PATH` como no pré-requisitos.
4. Nos secrets:
   - `SSH_HOST` = **`127.0.0.1`** se o job usar `ssh`/`scp` para o mesmo host onde o runner roda.
   - `SSH_PORT` = porta do `sshd` local.
5. Chave privada no secret `SSH_PRIVATE_KEY` com a pública em `authorized_keys` do usuário de deploy **nesse** servidor.
6. Execute o runner com o usuário adequado (não root), deixe **Listening for Jobs** e dispare o workflow manualmente.

**Validação:** no servidor, `ssh -p PORTA usuario@127.0.0.1` com a chave de deploy deve funcionar sem senha.

---

## Tipo 3 — Servidor Linux só em rede privada (sem IP público na internet)

**Quando usar:** datacenter interno, LAN, VPC sem rota direta a partir da nuvem da GitHub.

**Procedimento**

1. **Não** use `runs-on: ubuntu-latest` para alcançar esse IP: runners da GitHub não roteiam até sua LAN privada.
2. Instale o **runner self-hosted** em um computador ou VM que **tenha conectividade TCP** até o `sshd` do servidor de deploy (mesma rede, VPN, bastion).
3. Mantenha `runs-on: self-hosted` no workflow nesse runner.
4. Nos secrets:
   - `SSH_HOST` = IP ou hostname **como visto a partir do runner** (não necessariamente público).
   - `SSH_PORT`, `SSH_USER`, `DEPLOY_PATH`, chaves: iguais ao modelo já usado.
5. No servidor privado: `sshd`, usuário, chaves e diretório de deploy configurados como nos pré-requisitos.
6. Dispare o workflow manualmente.

**Validação:** **no host onde o runner está instalado**, teste `ssh`/`scp` até o servidor de destino antes de rodar o Actions.

---

## Tipo 4 — Mesma máquina do desenvolvedor (WSL no Windows)

**Quando usar:** laboratório local simulando pipeline; não substitui endurecimento de produção.

**Procedimento**

Siga integralmente o **`deploy-ssh-wsl-guia.md`** (Ubuntu no WSL, usuário `deploy`, OpenSSH, chaves, runner em `/home/deploy/actions-runner`, `SSH_HOST=127.0.0.1`, `DEPLOY_PATH` alinhado).

---

## Resumo: o que muda entre tipos

| Tipo | `runs-on` típico | `SSH_HOST` típico (secret) | Onde instalar o runner |
|------|------------------|---------------------------|-------------------------|
| 1 — Público + GitHub | `ubuntu-latest` | IP/DNS público do servidor | *(não precisa self-hosted)* |
| 2 — Público + runner no servidor | `self-hosted` | `127.0.0.1` | No próprio servidor Linux |
| 3 — Só rede privada | `self-hosted` | IP interno visível pelo runner | Máquina que alcança o servidor por rede |
| 4 — WSL local | `self-hosted` | `127.0.0.1` | WSL Ubuntu (ver guia WSL) |

Se você alterar `runs-on` entre `ubuntu-latest` e `self-hosted`, confira se o YAML foi commitado e se existe runner online quando usar `self-hosted`.
