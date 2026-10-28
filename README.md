# 🚀 LeadHunter SP - Buscador & CRM de Empresas Sem Site

> Sistema inteligente para prospecção ativa de clientes e venda de sites e landing pages para negócios em todo o Estado de São Paulo.

---

## 📌 O que este projeto faz?

1. **Cruza os 17 nichos mais lucrativos** (clínicas odontológicas, estética, advogados, contadores, arquitetos, pilates, barbearias, academias, cerimonialistas, etc.) com as cidades do Estado de São Paulo.
2. **Filtra apenas negócios sem presença web própria**:
   - 🚫 **Sem site algum** (alta urgência)
   - 📱 **Apenas Linktree / Bio** (fácil de converter para landing page própria)
   - 📸 **Apenas Instagram / Facebook** (perdem clientes no Google)
3. **Oferece 2 Mecanismos de Busca**:
   - ⚡ **Modo 100% Gratuito (OpenStreetMap)**: Comece a prospectar **hoje mesmo**, sem precisar de cartão ou chave de API!
   - 🌐 **Google Places API (New)**: Máxima precisão com dados oficiais do Google Maps, avaliações e telefones nacionais formatados.
4. **Gerador de Abordagem & WhatsApp com 1 Clique**: Gera na hora o link com mensagem personalizada para o nicho da empresa e a dor correspondente.
5. **Mini-CRM com Funil Kanban**: Acompanhe o status de cada lead (*Novo, Mensagem Enviada, Em Conversa, Proposta, Fechado*).
6. **Exportação Pronta para Excel**: Gera o arquivo `empresas_sem_site_sp.csv` com formatação UTF-8 BOM que abre perfeitamente no Microsoft Excel e Google Sheets.

---

## 🛠️ Como Usar

Você tem duas formas práticas de usar: pelo **Painel Web Visual (Recomendado)** ou pelo **Script em Terminal (Python)**.

---

### Opção 1: Painel Web Visual (Recomendado)

O painel visual possui dashboard completo, filtros rápidos, kanban de vendas e gerador de pitch.

1. No terminal do projeto, execute:
   ```bash
   node server.js
   ```
2. Abra no seu navegador:
   ```
   http://localhost:3000
   ```
3. Escolha o mecanismo (**Gratuito** ou **Google Places**), selecione as cidades e nichos e clique em **"Buscar Empresas Sem Site"**.
4. Clique em **"💬 Pitch"** para ver a abordagem personalizada ou **"Chamar no WhatsApp"** para abrir a conversa já com a mensagem preenchida!

---

### Opção 2: Script em Python (Linha de Comando)

Para quem prefere rodar em segundo plano ou em servidores:

#### 1. Instale os pré-requisitos:
```bash
pip install requests
```

#### 2. Execute a busca no modo gratuito (sem precisar de chave):
```bash
python buscar_empresas_sem_site.py --modo free --top 10
```

#### 3. Execute filtrando por uma cidade ou nicho específico:
```bash
# Exemplo: Apenas dentistas em Campinas
python buscar_empresas_sem_site.py --cidade "Campinas" --nicho "clínica odontológica"

# Exemplo: Advogados em São Paulo
python buscar_empresas_sem_site.py --cidade "São Paulo" --nicho "escritório de advocacia"
```

#### 4. Usando sua chave da Google Places API:
Crie um arquivo `.env` na raiz do projeto (ou copie de `.env.example`):
```env
GOOGLE_MAPS_API_KEY="AIzaSySuaChaveAqui"
```
E rode:
```bash
python buscar_empresas_sem_site.py --modo google --top 10
```

---

## 📂 Estrutura do Projeto

```
buscador_de_leads/
├── buscar_empresas_sem_site.py   # Script CLI em Python (com suporte a Google Places e OSM)
├── server.js                     # Servidor Node.js nativo (Zero dependências externas)
├── nichos.json                   # 17 nichos, dores de mercado e scripts de vendas prontos
├── cidades_sp.json               # 645 cidades de SP e polos comerciais estratégicos
├── empresas_sem_site_sp.csv      # Planilha gerada (exportável para Excel)
├── .env.example                  # Modelo de variáveis de ambiente
├── public/                       # Interface Web do Dashboard
│   ├── index.html                # Estrutura do dashboard e modal de pitches
│   ├── style.css                 # Design moderno dark/cyber com glassmorphism
│   └── app.js                    # Lógica do front-end e sincronização
└── GUIA_PROSPECCAO_VENDAS.md     # Guia prático passo a passo de como fechar clientes
```

---

## 💡 Dicas de Prospecção para Fechar Vendas

1. **Priorize Cidades Médias e Grandes**: Comece pelas cidades com mais de 200 mil habitantes (Campinas, Santos, Sorocaba, Ribeirão Preto, São José dos Campos, Grande SP). Nelas há muito mais negócios perdendo vendas no Google.
2. **Foco nos nichos de maior tíquete**:
   - Clínicas Odontológicas (1 implante dental paga o site inteiro).
   - Clínicas de Estética (procedimentos de R$ 1.500 a R$ 5.000).
   - Escritórios de Advocacia e Contabilidade.
3. **Abordagem pelo WhatsApp**: Use o botão **Pitch** na plataforma para enviar uma mensagem consultiva, oferecendo uma amostra visual ou apontando que concorrentes diretos estão aparecendo na frente no Google.
