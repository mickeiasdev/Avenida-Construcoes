# Deixar a loja no ar DE GRAÇA no Oracle Cloud

A Vercel é substituída por uma VM do **Oracle Always Free** (grátis para
sempre, sem pegadinha no preço — só exige cartão de crédito na abertura da
conta para validar identidade). A arquitetura fica:

| Peça | Onde fica | Paga? |
| --- | --- | --- |
| Banco, login, imagens, pagamentos | **Supabase** (continua igual) | Grátis |
| Site (HTML/JS/SEO) | **VM Oracle** (este guia) | Grátis |
| HTTPS automático | **Caddy** (Let's Encrypt) | Grátis |

O que a VM faz: serve o build estático (`pnpm build` → `dist/`) e as 4 rotas
dinâmicas de SEO (`/robots.txt`, `/sitemap.xml`, `/c/:slug`, `/produto/:id`)
que na Vercel eram serverless — tudo isso no `server.js`, **zero dependências**.

O Always Free dá até **4 ARM (Ampere A1) + 24 GB de RAM + 200 GB de disco +
10 TB de tráfego/mês**. Uma loja dessas usa uma fração disso.

---

## 1) Conta

1. Acesse [cloud.oracle.com](https://www.oracle.com/cloud/free/) → **Start for free**.
2. Vai pedir cartão de crédito (validação de identidade — **não cobra nada**
   enquanto você usar só os recursos "Always Free"; eles são marcados com o
   selo verde "FREE").
3. Escolha o **home region mais próximo** (ex.: *Brazil East (São Paulo)* —
   atenção: os recursos Always Free só existem no home region).

## 2) Criar a VM

Console → **Compute → Instances → Create instance**:

- **Name**: `loja`
- **Image**: Ubuntu 22.04 (ou 24.04)
- **Shape**: *Ampere* (VM.Standard.A1.Flex) → **1 OCPU, 6 GB RAM** (sobra
  cota pra mais VMs depois; 1 GB de RAM já seria o bastante pra este site)
- **Boot volume**: 50 GB (o Always Free dá 200 GB somando tudo)
- **SSH keys**: "Generate a key pair" → baixe a **.key** (privada) e a .pub.
  **Guarde a privada — sem ela não entra na VM.**
- Create.

Se o Ampere der **"Out of capacity"**: é o erro clássico do grátis deles —
tente de novo em outro horário, mude o *availability domain*, ou caia para o
x86 minúsculo (VM.Standard.E2.1.Micro, 1 GB — com o swap do passo 4 funciona
tranquilo também).

Depois de criada: aba da instância → **Public IP address → Edit →
"Reserved public IP"** (IP fixo que sobrevive a reinícios).

## 3) Liberar as portas (o passo que mais enrola todo mundo)

**Na OCI** (Networking → Virtual Cloud Networks → sua VCN → *Security
Lists* → *Default Security List* → **Add Ingress Rules**):

| Source | Port | Para |
| --- | --- | --- |
| 0.0.0.0/0 | 80 | site HTTP |
| 0.0.0.0/0 | 443 | site HTTPS |
| SEU_IP/32 | 22 | SSH (mais seguro que abrir pra todos) |

**Dentro do Ubuntu** (a imagem da OCI vem com firewall iptables próprio,
bloqueando 80/443 mesmo com a regra acima feita):

```bash
ssh -i sua-chave.key ubuntu@IP_DA_VM   # entrar
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 4) Preparar a VM

```bash
sudo apt update && sudo apt -y upgrade

# swap (obrigatório no micro de 1 GB, recomendável em todos)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 5) Instalar Node 22, pnpm, git e Caddy

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt -y install nodejs
sudo apt -y install git
sudo corepack enable && sudo corepack prepare pnpm@latest --activate
```

Caddy (HTTPS automático) — repositório oficial:

```bash
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy
```

## 6) Subir a loja

```bash
sudo useradd -r -m -s /usr/sbin/nologin loja
sudo mkdir -p /opt/loja && sudo chown loja:loja /opt/loja

# repositório PRIVADO? gere uma "deploy key" (SSH) no GitHub com permissão
# de leitura e use a URL git@github.com:... abaixo.
sudo -u loja git clone https://github.com/mickeiasdev/Avenida-Construcoes.git /opt/loja

cd /opt/loja
sudo -u loja cp .env.example .env
sudo nano .env   # cole VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e VITE_MP_PUBLIC_KEY do seu .env local

sudo -u loja pnpm install
sudo -u loja pnpm build   # gera dist/
```

## 7) Rodar como serviço (liga com o servidor, canta se cair)

```bash
sudo cp deploy/oracle/wls.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wls
curl localhost:3000/healthz        # deve responder "ok"
```

## 8) Domínio + HTTPS grátis

1. Aponte um **A record** do seu domínio para o IP reservado da VM.
   Sem domínio? Crie um subdomínio grátis no [DuckDNS](https://www.duckdns.org)
   (`sualoja.duckdns.org`) apontando pro mesmo IP.
2. Copie o Caddyfile e troque o domínio:

```bash
sudo nano /etc/caddy/Caddyfile   # cole o conteúdo de deploy/oracle/Caddyfile
                                    # com o SEU domínio no lugar de sualoja.com.br
sudo systemctl reload caddy
```

Pronto: **https://sualoja.com.br** no ar, com certificado renovado sozinho.

## 9) Atualizar a loja depois (a parte que você repete)

```bash
cd /opt/loja
sudo -u loja git pull
sudo -u loja pnpm install
sudo -u loja pnpm build
sudo systemctl restart wls
```

---

## Avisos do Always Free que ninguém conta

- **VM "idle" pode ser desligada**: se a VM ficar 7 dias com uso de
  CPU/rede abaixo de ~20% (95º percentil), a Oracle pode pará-la. Loja com
  visitantes reais nunca fica idle. Quer blindar 100%? Faça o upgrade
  **Pay As You Go** — continua custando R$ 0 dentro dos limites Always Free
  e a VM deixa de ser candidata ao desligamento.
- **Use IP reservado** (passo 2) — o efêmero muda a cada reboot.
- **Seu dado crítico é o Supabase** (produtos, pedidos, clientes): a VM é
  descartável — pode ser recriada em 20 min seguindo este guia de novo.
- Migrations SQL (pasta `supabase/`) continuam sendo aplicadas pelo
  **SQL Editor do Supabase**, como sempre — nada muda no banco.
