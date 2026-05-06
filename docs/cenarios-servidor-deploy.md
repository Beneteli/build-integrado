# Cenários de servidor e runner para deploy com GitHub Actions

Texto de apoio conceitual. Para listas de passos objetivos por tipo de máquina, use [`procedimentos-por-tipo-servidor.md`](procedimentos-por-tipo-servidor.md).

---

## 1. Dois eixos que definem o cenário

### 1.1 Onde o job do Actions executa

| Tipo | Significado |
|------|-------------|
| **Runner hospedado pela GitHub** | Você usa `runs-on: ubuntu-latest` (ou `windows-latest`, etc.). O workflow roda em uma máquina virtual **na infraestrutura da GitHub**, na internet. |
| **Runner self-hosted** | Você instala o aplicativo “GitHub Actions Runner” em **uma máquina sua** (PC, VM, servidor). O workflow roda **nessa** máquina quando você usa `runs-on: self-hosted`. |

### 1.2 Onde está o servidor Linux que recebe o deploy

- **Alcançável pela internet**: IP público, ou hostname que resolve para IP público, com SSH exposto (normalmente porta 22 ou outra configurada).
- **Só na rede privada**: IP tipo `10.x`, `172.16–31.x`, `192.168.x`, ou VLAN/VPN sem rota direta a partir da internet pública.
- **Mesmo host que o runner**: por exemplo runner e `sshd` no mesmo WSL ou na mesma VM; então `SSH_HOST` pode ser `127.0.0.1`.

O deploy deste repositório usa **SSH + SCP** para copiar `dist.tar.gz` e extrair em `DEPLOY_PATH/current`. Quem precisa “enxergar” o SSH é **o processo que executa esses comandos**, ou seja, o **runner** onde o job está rodando.

---

## 2. Cenário A — Servidor Linux separado com IP público (ou DNS na internet)

O servidor de produção (ou homologação) tem **endereço acessível a partir da internet** e o SSH está liberado no firewall para conexões vindas de fora (com política segura: preferencialmente só chave, sem senha).

### A.1 Runner hospedado (`ubuntu-latest`) + deploy por SSH

- O job builda no runner da GitHub e executa `scp`/`ssh` para `SSH_HOST` = **IP ou DNS público** do servidor.
- **Vantagens:** não é preciso instalar nem manter runner na sua infra; o repositório continua sendo o centro do disparo (manual ou por evento).
- **Cuidados:**
  - Os runners da GitHub usam endereços de saída que mudam; muitos times abrem SSH para a internet com autenticação **somente por chave**, endurecem `sshd` e monitoram logs. Alguns restringem por faixas de IP publicadas pela GitHub (lista que pode mudar).
  - Os secrets (`SSH_HOST`, `SSH_PORT`, `SSH_USER`, `DEPLOY_PATH`, `SSH_PRIVATE_KEY`) apontam para **esse servidor**.

### A.2 Runner self-hosted **instalado no próprio servidor Linux**

- O job roda **no mesmo servidor** (ou na mesma rede sem precisar SSH “de fora”).
- O workflow pode continuar igual conceitualmente; em muitos casos usa-se `SSH_HOST=127.0.0.1` se o extrator remoto for via SSH local, ou adapta-se para copiar arquivos direto no disco sem SSH.
- **Vantagens:** o pipeline não depende de expor SSH à internet só para o GitHub; a superfície de ataque pode ser menor.
- **Cuidados:** atualização e monitoramento do agente do runner no servidor (serviço, logs, permissões do usuário que executa o runner).

**Quando escolher qual:** se quer **mínima operação** no servidor e aceita SSH bem endurecido na internet, **A.1** é comum. Se prefere **não depender** de SSH público para o CI, **A.2** é uma opção forte.

---

## 3. Cenário B — Servidor Linux só na rede privada (sem IP público direto)

Exemplos: máquina no escritório, datacenter interno, cloud com VPC sem IP elástico público, homelab.

- Runners **hospedados pela GitHub** **não** possuem rota de rede até esses IPs privados. É o mesmo princípio do WSL com `172.x`: a nuvem da GitHub não “entra” na sua LAN.
- **Caminhos típicos:**
  - Instalar um **runner self-hosted** em uma VM ou PC que tenha **conectividade** até esse servidor (mesma LAN, VPN site-to-site, bastion).
  - Ou expor o deploy por outro mecanismo (agente no servidor que baixa artefatos por HTTPS com token, webhook interno, etc.), o que exigiria mudar o workflow além do modelo atual SSH.

Para o **mesmo** `deploy.yml` baseado em SCP/SSH, o essencial é: **quem roda o job precisa conseguir abrir TCP até o `sshd` do destino** (ou o destino precisa ser `localhost` se o runner está no próprio servidor).

---

## 4. Cenário C — Mesma máquina do desenvolvedor (WSL no Windows)

- Runner **self-hosted** no WSL (ou no Windows, conforme configuração).
- Servidor SSH e pasta de deploy **no mesmo WSL** → `SSH_HOST` frequentemente **`127.0.0.1`**.
- Objetivo: simular pipeline real sem VPS; **não** substitui hardening de produção na internet.

Detalhes operacionais estão no `deploy-ssh-wsl-guia.md` na raiz do repositório.

---

## 5. Tabela comparativa rápida

| Onde está o servidor | Runner `ubuntu-latest` consegue dar SSH? | Runner self-hosted: onde instalar? |
|----------------------|--------------------------------------------|-------------------------------------|
| IP público + SSH aberto | Sim, se firewall e políticas permitirem | Opcional: no próprio servidor ou em qualquer host que tenha SSH até ele |
| Só rede privada | Não | Em um host **dentro** da rede que alcança o servidor |
| Mesmo WSL / mesma VM | Não (para o IP privado do host se o runner estiver na nuvem) | No próprio WSL/VM; `127.0.0.1` costuma bastar |

---

## 6. O que ajustar no workflow e nos secrets

O arquivo `.github/workflows/deploy.yml` usa variáveis de ambiente lidas dos secrets:

- `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `DEPLOY_PATH`, `SSH_PRIVATE_KEY`.

Ao mudar de cenário, o que normalmente muda é:

- **`SSH_HOST` e `SSH_PORT`**: devem refletir **onde o `sshd` escuta** visto **a partir do runner** que executa o job (IP público, IP interno, ou `127.0.0.1`).
- **`runs-on`**: `ubuntu-latest` para runner na GitHub; `self-hosted` quando o job roda na sua máquina ou no seu servidor com o agente instalado.

A lógica de build (`npm ci`, `npm run build`, empacotar `dist`, SCP, SSH remoto) pode permanecer igual entre cenários; o que muda é **rede + onde o runner está registrado**.

---

## 7. Segurança (lembrete)

- Preferir **autenticação apenas por chave** para o usuário de deploy.
- Restringir o que esse usuário pode fazer no servidor (diretório de deploy, sem sudo desnecessário).
- Em produção na internet, avaliar firewall, porta SSH não padrão, `fail2ban`, e revisão periódica das chaves.

Este documento não substitui políticas da sua organização; serve para alinhar **arquitetura de rede + tipo de runner** com o fluxo de deploy por SSH usado neste projeto.
