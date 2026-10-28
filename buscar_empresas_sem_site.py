#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Buscador de Empresas Sem Site - Estado de São Paulo
===================================================
Localiza negócios e profissionais liberais que NÃO têm site próprio
(ou usam apenas Instagram, Linktree, Facebook, WhatsApp).

Suporta 2 Mecanismos:
1. Google Places API (New) - Alta precisão, telefones oficiais e dados ricos.
2. OpenStreetMap / Overpass (100% Gratuito) - Sem necessidade de chave ou cartão.

Uso:
  python buscar_empresas_sem_site.py
  python buscar_empresas_sem_site.py --modo free --top 5
  python buscar_empresas_sem_site.py --cidade "Campinas" --nicho "clínica odontológica"
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote, urlparse

try:
    import requests
except ImportError:
    print("[!] O pacote 'requests' não está instalado. Instale com: pip install requests")
    sys.exit(1)

# Diretório base
BASE_DIR = Path(__file__).resolve().parent

# Carregar Nichos e Cidades
def carregar_dados():
    nichos_path = BASE_DIR / "nichos.json"
    cidades_path = BASE_DIR / "cidades_sp.json"

    nichos = []
    cidades = []

    if nichos_path.exists():
        with open(nichos_path, "r", encoding="utf-8") as f:
            nichos_data = json.load(f)
            nichos = [n["busca"] for n in nichos_data]
    else:
        nichos = [
            "clínica odontológica", "clínica de estética", "consultório de psicologia",
            "consultório de fisioterapia", "escritório de advocacia",
            "escritório de contabilidade", "arquiteto", "engenheiro civil autônomo",
            "salão de beleza", "barbearia", "estúdio de tatuagem", "studio de pilates",
            "personal trainer", "academia", "fotógrafo", "cerimonialista",
            "assessoria de casamento",
        ]

    if cidades_path.exists():
        with open(cidades_path, "r", encoding="utf-8") as f:
            cidades_data = json.load(f)
            cidades = [c["cidade"] for c in cidades_data.get("top_cidades_estrategicas", [])]
    else:
        cidades = [
            "São Paulo", "Campinas", "Santos", "Guarulhos", "São Bernardo do Campo",
            "Santo André", "Osasco", "Ribeirão Preto", "Sorocaba", "São José dos Campos",
            "Jundiaí", "Piracicaba", "Bauru", "São José do Rio Preto", "Taboão da Serra",
            "Embu das Artes", "Embu-Guaçu", "Cotia", "Mogi das Cruzes", "Barueri",
        ]

    return nichos, cidades

# Carregar arquivo .env manual caso exista
def carregar_env():
    env_file = BASE_DIR / ".env"
    if env_file.exists():
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k not in os.environ:
                        os.environ[k] = v

carregar_env()

GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
GOOGLE_FIELDS = (
    "places.id,places.displayName,places.formattedAddress,"
    "places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,"
    "places.businessStatus,places.rating,places.userRatingCount,nextPageToken"
)

REDES_SOCIAIS = {
    "instagram.com": "só Instagram",
    "linktr.ee": "só Linktree/Bio",
    "beacons.ai": "só Linktree/Bio",
    "bio.link": "só Linktree/Bio",
    "linktree.com": "só Linktree/Bio",
    "instabio.cc": "só Linktree/Bio",
    "facebook.com": "só Facebook",
    "wa.me": "só WhatsApp",
    "api.whatsapp.com": "só WhatsApp",
    "tiktok.com": "só TikTok",
}


def classificar_site(site_uri):
    """
    Retorna a classificação do site:
    - 'sem site': se não tiver site nenhum
    - 'só Linktree/Bio', 'só Instagram', etc.: se o site for link de bio ou rede social
    - None: se tiver um site próprio legítimo
    """
    if not site_uri:
        return "sem site"
    try:
        dominio = urlparse(site_uri).netloc.lower()
    except Exception:
        return "sem site"

    for rede, rotulo in REDES_SOCIAIS.items():
        if rede in dominio:
            return rotulo

    return None  # Tem site próprio, ignoramos


def formatar_link_whatsapp(telefone, nome_empresa, nicho):
    """Gera link direto com mensagem pronta de abordagem no WhatsApp."""
    if not telefone:
        return ""
    # Manter apenas números
    numeros = re.sub(r"\D", "", str(telefone))
    if not numeros:
        return ""
    # Adicionar código do Brasil se necessário
    if not numeros.startswith("55"):
        numeros = "55" + numeros
    
    msg = (
        f"Olá equipe da {nome_empresa}! Vi o trabalho impecável de vocês em {nicho}. "
        f"Notei que vocês não têm um site oficial no Google e gostaria de enviar uma prévia de página moderna sem compromisso. Posso mandar por aqui?"
    )
    return f"https://wa.me/{numeros}?text={quote(msg)}"


# ==========================================
# MECANISMO 1: Google Places API (New)
# ==========================================
def buscar_google(consulta, api_key, max_paginas=1):
    token = None
    for _ in range(max_paginas):
        corpo = {"textQuery": consulta, "languageCode": "pt-BR", "pageSize": 20}
        if token:
            corpo["pageToken"] = token
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": GOOGLE_FIELDS,
        }
        resp = requests.post(GOOGLE_PLACES_URL, json=corpo, headers=headers, timeout=30)
        if resp.status_code != 200:
            if resp.status_code == 403:
                print(f"\n [!] Permissão Negada (403): O serviço 'Places API (New)' precisa ser ativado no seu projeto Google Cloud.")
                print("     1. Acesse: https://console.cloud.google.com/marketplace/product/google/places.googleapis.com")
                print("     2. Clique em 'ATIVAR' (ENABLE) e certifique-se de vincular uma conta de faturamento.")
                print("     Dica: Você pode rodar agora mesmo usando o modo gratuito: --modo free\n")
            else:
                print(f" [!] Erro API Google ({resp.status_code}): {resp.text[:150]}")
            break
        dados = resp.json()
        places = dados.get("places", [])
        for p in places:
            yield {
                "id": p.get("id"),
                "nome": p.get("displayName", {}).get("text", "Sem Nome"),
                "telefone": p.get("nationalPhoneNumber", ""),
                "endereco": p.get("formattedAddress", ""),
                "website": p.get("websiteUri", ""),
                "maps_url": p.get("googleMapsUri", ""),
                "status": p.get("businessStatus", "OPERATIONAL"),
                "avaliacao": p.get("rating", ""),
                "total_avaliacoes": p.get("userRatingCount", 0),
                "fonte": "Google Places",
            }
        token = dados.get("nextPageToken")
        if not token:
            break
        time.sleep(2)


# ==========================================
# MECANISMO 2: OpenStreetMap / Nominatim (100% Free)
# ==========================================
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

TERMOS_SIMPLIFICADOS = {
    "clínica odontológica": ["dentista", "odontologia", "clínica odontológica"],
    "clínica de estética": ["estética", "clínica de estética"],
    "consultório de psicologia": ["psicólogo", "psicologia", "consultório de psicologia"],
    "consultório de fisioterapia": ["fisioterapia", "fisioterapeuta"],
    "escritório de advocacia": ["advogado", "advocacia", "escritório de advocacia"],
    "escritório de contabilidade": ["contabilidade", "contador"],
    "arquiteto": ["arquiteto", "arquitetura"],
    "engenheiro civil autônomo": ["engenheiro", "engenharia"],
    "salão de beleza": ["cabeleireiro", "salão de beleza"],
    "barbearia": ["barbearia"],
    "estúdio de tatuagem": ["tatuagem", "tattoo"],
    "studio de pilates": ["pilates"],
    "personal trainer": ["personal trainer"],
    "academia": ["academia"],
    "fotógrafo": ["fotógrafo", "fotografia"],
    "cerimonialista": ["cerimonialista", "eventos"],
    "assessoria de casamento": ["assessoria de casamento", "casamento"],
}

def buscar_osm(nicho, cidade):
    """Busca POIs no OpenStreetMap via Nominatim sem necessidade de chave de API."""
    termos = TERMOS_SIMPLIFICADOS.get(nicho.lower(), [nicho])
    vistos_nesta = set()

    headers = {
        "User-Agent": "LeadHunterSP_Prospeccao/1.0 (contato@prospeccao.local)"
    }

    for termo in termos:
        q = f"{termo} {cidade} SP"
        params = {
            "q": q,
            "format": "json",
            "addressdetails": 1,
            "extratags": 1,
            "limit": 30,
        }
        try:
            resp = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=25)
            if resp.status_code != 200:
                continue
            dados = resp.json()
            for item in dados:
                elem_id = f"osm_{item.get('osm_type', 'node')}_{item.get('osm_id')}"
                if elem_id in vistos_nesta:
                    continue
                vistos_nesta.add(elem_id)

                nome = item.get("name") or (item.get("display_name", "").split(",")[0])
                if not nome or len(nome) < 3:
                    continue

                extra = item.get("extratags") or {}
                website = (
                    extra.get("website")
                    or extra.get("contact:website")
                    or extra.get("url")
                    or ""
                )
                telefone = (
                    extra.get("phone")
                    or extra.get("contact:phone")
                    or extra.get("contact:whatsapp")
                    or ""
                )

                addr = item.get("address") or {}
                rua = addr.get("road", "")
                num = addr.get("house_number", "")
                bairro = addr.get("suburb") or addr.get("neighbourhood", "")
                cid = addr.get("city") or addr.get("town") or addr.get("municipality") or cidade

                endereco_partes = [p for p in [rua, num, bairro, cid, "SP"] if p]
                endereco = ", ".join(endereco_partes) if endereco_partes else item.get("display_name", "")

                maps_url = f"https://www.google.com/maps/search/{quote(nome + ' ' + cidade)}"

                yield {
                    "id": elem_id,
                    "nome": nome,
                    "telefone": telefone,
                    "endereco": endereco,
                    "website": website,
                    "maps_url": maps_url,
                    "status": "OPERATIONAL",
                    "avaliacao": "",
                    "total_avaliacoes": 0,
                    "fonte": "OpenStreetMap",
                }
            if len(dados) >= 5:
                # Já obteve uma boa quantidade de resultados para este nicho/cidade
                break
        except Exception as e:
            print(f" [!] Erro busca gratuita para {cidade}: {e}")




def carregar_leads_existentes(csv_path):
    vistos = set()
    if os.path.exists(csv_path):
        try:
            with open(csv_path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row.get("id"):
                        vistos.add(row["id"])
                    elif row.get("nome") and row.get("cidade"):
                        vistos.add(f"{row['nome']}_{row['cidade']}")
        except Exception:
            pass
    return vistos


def main():
    parser = argparse.ArgumentParser(
        description="Buscador de Empresas Sem Site - Estado de SP para Prospecção Ativa"
    )
    parser.add_argument(
        "--modo",
        choices=["google", "free", "auto"],
        default="auto",
        help="Mecanismo de busca: 'google' (Google Places API), 'free' (OpenStreetMap 100%% gratuito), ou 'auto'",
    )
    parser.add_argument("--cidade", type=str, help="Filtrar por uma cidade específica de SP")
    parser.add_argument("--nicho", type=str, help="Filtrar por um nicho específico")
    parser.add_argument("--top", type=int, default=10, help="Quantidade de top cidades a pesquisar (padrão: 10)")
    parser.add_argument("--todas", action="store_true", help="Pesquisar todas as cidades do arquivo de dados")
    parser.add_argument("--max-paginas", type=int, default=1, help="Páginas por nicho no Google (1 página = 20 resultados)")
    parser.add_argument("--saida", type=str, default="empresas_sem_site_sp.csv", help="Nome do arquivo CSV de saída")

    args = parser.parse_args()

    todos_nichos, todas_cidades = carregar_dados()

    # Seleção de nichos
    if args.nicho:
        nichos_alvo = [n for n in todos_nichos if args.nicho.lower() in n.lower()]
        if not nichos_alvo:
            nichos_alvo = [args.nicho]
    else:
        nichos_alvo = todos_nichos

    # Seleção de cidades
    if args.cidade:
        cidades_alvo = [args.cidade]
    elif args.todas:
        cidades_alvo = todas_cidades
    else:
        cidades_alvo = todas_cidades[: args.top]

    # Determinar modo
    google_key = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
    modo = args.modo
    if modo == "auto":
        if google_key and len(google_key) > 10:
            modo = "google"
            print("[+] Chave GOOGLE_MAPS_API_KEY detectada! Usando Google Places API (New).")
        else:
            modo = "free"
            print("[*] Nenhuma chave Google configurada. Usando Modo 100% Gratuito (OpenStreetMap).")
    elif modo == "google" and not google_key:
        print("[!] Erro: Você escolheu --modo google mas a variável GOOGLE_MAPS_API_KEY não está definida.")
        print("    Configure no arquivo .env ou execute: export GOOGLE_MAPS_API_KEY=\"sua_chave\"")
        print("    Ou use o modo 100% gratuito com: --modo free")
        sys.exit(1)

    csv_path = BASE_DIR / args.saida
    vistos = carregar_leads_existentes(csv_path)

    print("\n" + "=" * 65)
    print(f"  BUSCADOR DE LEADS SEM SITE - ESTADO DE SÃO PAULO")
    print(f"  Mecanismo: {modo.upper()} | Nichos: {len(nichos_alvo)} | Cidades: {len(cidades_alvo)}")
    print(f"  Arquivo de saída: {args.saida}")
    print(f"  Leads já catalogados: {len(vistos)}")
    print("=" * 65 + "\n")

    file_exists = csv_path.exists()
    novos_leads = 0

    colunas = [
        "id", "nicho", "cidade", "nome", "telefone", "situacao",
        "site_atual", "whatsapp_link", "endereco", "avaliacao",
        "total_avaliacoes", "google_maps", "fonte", "status_prospeccao", "data_captura"
    ]

    with open(csv_path, "a", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        if not file_exists or os.path.getsize(csv_path) == 0:
            w.writerow(colunas)

        total_combinacoes = len(nichos_alvo) * len(cidades_alvo)
        progresso = 0

        for cidade in cidades_alvo:
            for nicho in nichos_alvo:
                progresso += 1
                prefixo = f"[{progresso}/{total_combinacoes}] {nicho} em {cidade}"
                print(f"[*] {prefixo}...", end="\r", flush=True)

                gerador = None
                if modo == "google":
                    consulta = f"{nicho} em {cidade}, SP"
                    gerador = buscar_google(consulta, google_key, max_paginas=args.max_paginas)
                else:
                    gerador = buscar_osm(nicho, cidade)

                encontrados_nesta_busca = 0
                for p in gerador:
                    p_id = p.get("id") or f"{p['nome']}_{cidade}"
                    if p_id in vistos:
                        continue
                    if p.get("status") not in (None, "OPERATIONAL"):
                        continue

                    situacao = classificar_site(p.get("website"))
                    if not situacao:
                        continue  # Tem site próprio oficial, ignorar

                    vistos.add(p_id)
                    novos_leads += 1
                    encontrados_nesta_busca += 1

                    wa_link = formatar_link_whatsapp(p.get("telefone"), p["nome"], nicho)
                    data_hoje = time.strftime("%Y-%m-%d")

                    w.writerow([
                        p_id,
                        nicho,
                        cidade,
                        p["nome"],
                        p.get("telefone", ""),
                        situacao,
                        p.get("website", ""),
                        wa_link,
                        p.get("endereco", ""),
                        p.get("avaliacao", ""),
                        p.get("total_avaliacoes", 0),
                        p.get("maps_url", ""),
                        p.get("fonte", modo),
                        "Novo / Não abordado",
                        data_hoje,
                    ])
                    f.flush()

                if encontrados_nesta_busca > 0:
                    print(f"[+] {prefixo} -> +{encontrados_nesta_busca} leads sem site encontrados!")

                # Pausa para respeitar as APIs
                time.sleep(1.0 if modo == "free" else 0.4)

    print("\n" + "=" * 65)
    print(f" BUSCA CONCLUÍDA COM SUCESSO!")
    print(f" Novos leads adicionados: {novos_leads}")
    print(f" Total acumulado na planilha: {len(vistos)}")
    print(f" Planilha salva em: {csv_path.name}")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    main()
