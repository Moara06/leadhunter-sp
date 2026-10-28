/**
 * Servidor Local do Buscador de Leads Sem Site
 * 100% Zero-Dependency (Usa APIs nativas do Node.js: http, fs, path, fetch)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;
const PUBLIC_DIR = path.join(BASE_DIR, 'public');

// Carregar variáveis de .env se existir
function carregarEnv() {
  const envPath = path.join(BASE_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [k, ...v] = trimmed.split('=');
        const key = k.trim();
        const val = v.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
carregarEnv();

// Carregar dados de nichos e cidades
function getNichos() {
  const file = path.join(BASE_DIR, 'nichos.json');
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return [];
}

function getCidades() {
  const file = path.join(BASE_DIR, 'cidades_sp.json');
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return { top_cidades_estrategicas: [], cidades_sp: [] };
}

// Carregar leads do CSV ou JSON
function getLeads() {
  const jsonPath = path.join(BASE_DIR, 'leads_armazenados.json');
  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (e) {
      console.error('Erro ao ler leads_armazenados.json:', e);
    }
  }

  // Tentar ler do CSV
  const csvPath = path.join(BASE_DIR, 'empresas_sem_site_sp.csv');
  if (fs.existsSync(csvPath)) {
    try {
      const content = fs.readFileSync(csvPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      if (lines.length > 1) {
        const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const leads = [];
        for (let i = 1; i < lines.length; i++) {
          // Parse simples de CSV considerando aspas
          const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
          const matches = [];
          let match;
          while ((match = regex.exec(lines[i])) !== null) {
            let val = match[1] || '';
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.slice(1, -1).replace(/""/g, '"');
            }
            matches.push(val);
            if (regex.lastIndex >= lines[i].length) break;
          }
          if (matches.length >= 4) {
            const item = {};
            headers.forEach((h, idx) => {
              item[h] = matches[idx] || '';
            });
            leads.push(item);
          }
        }
        return leads;
      }
    } catch (e) {
      console.error('Erro ao ler CSV:', e);
    }
  }

  return [];
}

function saveLeads(leads) {
  const jsonPath = path.join(BASE_DIR, 'leads_armazenados.json');
  fs.writeFileSync(jsonPath, JSON.stringify(leads, null, 2), 'utf8');

  // Atualizar também o CSV
  const csvPath = path.join(BASE_DIR, 'empresas_sem_site_sp.csv');
  const headers = [
    'id', 'nicho', 'cidade', 'nome', 'telefone', 'situacao',
    'site_atual', 'whatsapp_link', 'endereco', 'avaliacao',
    'total_avaliacoes', 'google_maps', 'fonte', 'status_prospeccao', 'data_captura'
  ];

  let csvContent = '\uFEFF' + headers.join(',') + '\n';
  leads.forEach(l => {
    const row = headers.map(h => {
      let val = l[h] !== undefined ? String(l[h]) : '';
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    csvContent += row.join(',') + '\n';
  });

  fs.writeFileSync(csvPath, csvContent, 'utf8');
}

// Classificador de URL de site
const REDES_SOCIAIS = {
  'instagram.com': 'só Instagram',
  'linktr.ee': 'só Linktree/Bio',
  'beacons.ai': 'só Linktree/Bio',
  'bio.link': 'só Linktree/Bio',
  'linktree.com': 'só Linktree/Bio',
  'instabio.cc': 'só Linktree/Bio',
  'facebook.com': 'só Facebook',
  'wa.me': 'só WhatsApp',
  'api.whatsapp.com': 'só WhatsApp',
  'tiktok.com': 'só TikTok'
};

function classificarSite(siteUri) {
  if (!siteUri || siteUri.trim() === '') return 'sem site';
  try {
    const parsed = new URL(siteUri);
    const host = parsed.hostname.toLowerCase();
    for (const [key, label] of Object.entries(REDES_SOCIAIS)) {
      if (host.includes(key)) return label;
    }
    return null; // Tem site próprio, ignoramos
  } catch (e) {
    return 'sem site';
  }
}

function formatarWhatsAppLink(telefone, nome, nicho) {
  if (!telefone) return '';
  const numLimpo = String(telefone).replace(/\D/g, '');
  if (!numLimpo) return '';
  const numFinal = numLimpo.startsWith('55') ? numLimpo : '55' + numLimpo;
  const msg = `Olá equipe da ${nome}! Vi o trabalho excelente de vocês em ${nicho}. Notei que vocês ainda não possuem um site próprio oficial no Google. Criei uma prévia moderna de página para captação de clientes. Posso te enviar por aqui?`;
  return `https://wa.me/${numFinal}?text=${encodeURIComponent(msg)}`;
}

// Busca Google Places API (New)
async function buscarGooglePlaces(nicho, cidade, apiKey) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const query = `${nicho} em ${cidade}, SP`;
  const fields = 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus,places.rating,places.userRatingCount';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fields
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'pt-BR',
        pageSize: 20
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 403) {
        throw new Error(
          "Permissão Negada (403): O serviço 'Places API (New)' ainda não foi ativado no seu projeto Google Cloud ou o faturamento não está vinculado. Ative em: https://console.cloud.google.com/marketplace/product/google/places.googleapis.com ou use o Modo 100% Gratuito."
        );
      }
      throw new Error(`Google API erro ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const results = [];
    const places = data.places || [];

    for (const p of places) {
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
      const situacao = classificarSite(p.websiteUri);
      if (!situacao) continue; // Tem site oficial

      const nome = p.displayName ? p.displayName.text : 'Sem Nome';
      const telefone = p.nationalPhoneNumber || '';

      results.push({
        id: p.id,
        nicho,
        cidade,
        nome,
        telefone,
        situacao,
        site_atual: p.websiteUri || '',
        whatsapp_link: formatarWhatsAppLink(telefone, nome, nicho),
        endereco: p.formattedAddress || '',
        avaliacao: p.rating || '',
        total_avaliacoes: p.userRatingCount || 0,
        google_maps: p.googleMapsUri || `https://www.google.com/maps/search/${encodeURIComponent(nome + ' ' + cidade)}`,
        fonte: 'Google Places (New)',
        status_prospeccao: 'Novo / Não abordado',
        data_captura: new Date().toISOString().split('T')[0]
      });
    }

    return results;
  } catch (err) {
    console.error('Erro na busca do Google:', err);
    throw err;
  }
}

const TERMOS_SIMPLIFICADOS = {
  'clínica odontológica': ['dentista', 'odontologia', 'clínica odontológica'],
  'clínica de estética': ['estética', 'clínica de estética'],
  'consultório de psicologia': ['psicólogo', 'psicologia', 'consultório de psicologia'],
  'consultório de fisioterapia': ['fisioterapia', 'fisioterapeuta'],
  'escritório de advocacia': ['advogado', 'advocacia', 'escritório de advocacia'],
  'escritório de contabilidade': ['contabilidade', 'contador'],
  'arquiteto': ['arquiteto', 'arquitetura'],
  'engenheiro civil autônomo': ['engenheiro', 'engenharia'],
  'salão de beleza': ['cabeleireiro', 'salão de beleza'],
  'barbearia': ['barbearia'],
  'estúdio de tatuagem': ['tatuagem', 'tattoo'],
  'studio de pilates': ['pilates'],
  'personal trainer': ['personal trainer'],
  'academia': ['academia'],
  'fotógrafo': ['fotógrafo', 'fotografia'],
  'cerimonialista': ['cerimonialista', 'eventos'],
  'assessoria de casamento': ['assessoria de casamento', 'casamento']
};

// Busca Gratuita OpenStreetMap (Nominatim)
async function buscarOsmNominatim(nicho, cidade) {
  const termos = TERMOS_SIMPLIFICADOS[nicho.toLowerCase()] || [nicho];
  const results = [];
  const vistos = new Set();

  for (const termo of termos) {
    const query = `${termo} ${cidade} SP`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&extratags=1&limit=25`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'LeadHunterSP_Server/1.0 (contato@prospeccao.local)'
        }
      });

      if (!res.ok) continue;

      const data = await res.json();

      for (const item of data) {
        const itemId = `osm_${item.osm_type || 'node'}_${item.osm_id}`;
        if (vistos.has(itemId)) continue;
        vistos.add(itemId);

        const nome = item.name || (item.display_name ? item.display_name.split(',')[0] : '');
        if (!nome || nome.length < 3) continue;

        const extra = item.extratags || {};
        const website = extra.website || extra['contact:website'] || extra.url || '';
        const situacao = classificarSite(website);
        if (!situacao) continue; // Tem site oficial próprio

        const telefone = extra.phone || extra['contact:phone'] || extra['contact:whatsapp'] || '';
        const addr = item.address || {};
        const rua = addr.road || '';
        const num = addr.house_number || '';
        const bairro = addr.suburb || addr.neighbourhood || '';
        const cid = addr.city || addr.town || addr.municipality || cidade;

        const partes = [rua, num, bairro, cid, 'SP'].filter(Boolean);
        const endereco = partes.length > 0 ? partes.join(', ') : item.display_name;

        results.push({
          id: itemId,
          nicho,
          cidade,
          nome,
          telefone,
          situacao,
          site_atual: website,
          whatsapp_link: formatarWhatsAppLink(telefone, nome, nicho),
          endereco: endereco || `${cidade}, SP`,
          avaliacao: '',
          total_avaliacoes: 0,
          google_maps: `https://www.google.com/maps/search/${encodeURIComponent(nome + ' ' + cidade)}`,
          fonte: 'OpenStreetMap (Gratuito)',
          status_prospeccao: 'Novo / Não abordado',
          data_captura: new Date().toISOString().split('T')[0]
        });
      }

      if (results.length >= 6) break;
    } catch (err) {
      console.error(`Erro OSM Nominatim para ${termo} em ${cidade}:`, err);
    }
  }

  return results;
}

// Router HTTP
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Headers de CORS e JSON
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoints
  if (pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      nichos: getNichos(),
      cidades: getCidades(),
      temGoogleKey: !!(process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY.length > 10)
    }));
    return;
  }

  if (pathname === '/api/leads' && req.method === 'GET') {
    const leads = getLeads();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(leads));
    return;
  }

  if (pathname === '/api/leads/update-status' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, status_prospeccao, notas } = JSON.parse(body);
        const leads = getLeads();
        const lead = leads.find(l => l.id === id);
        if (lead) {
          lead.status_prospeccao = status_prospeccao;
          if (notas !== undefined) lead.notas = notas;
          saveLeads(leads);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, lead }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Lead não encontrado' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (pathname === '/api/search' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { modo, nichos, cidades, googleKey } = JSON.parse(body);
        const apiKey = googleKey || process.env.GOOGLE_MAPS_API_KEY;

        const leadsExistentes = getLeads();
        const idsExistentes = new Set(leadsExistentes.map(l => l.id));

        const novosLeads = [];
        const logs = [];

        for (const cidade of cidades) {
          for (const nicho of nichos) {
            logs.push(`Pesquisando ${nicho} em ${cidade}...`);
            let encontrados = [];

            if (modo === 'google') {
              if (!apiKey) {
                throw new Error('Chave GOOGLE_MAPS_API_KEY não fornecida para busca Google.');
              }
              encontrados = await buscarGooglePlaces(nicho, cidade, apiKey);
            } else {
              encontrados = await buscarOsmNominatim(nicho, cidade);
            }

            for (const item of encontrados) {
              if (!idsExistentes.has(item.id)) {
                idsExistentes.add(item.id);
                leadsExistentes.unshift(item);
                novosLeads.push(item);
              }
            }
          }
        }

        saveLeads(leadsExistentes);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          novos_encontrados: novosLeads.length,
          total_geral: leadsExistentes.length,
          leads: novosLeads,
          todos_leads: leadsExistentes
        }));
      } catch (err) {
        console.error('Erro na rota /api/search:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Exportar CSV
  if (pathname === '/api/export-csv') {
    const csvPath = path.join(BASE_DIR, 'empresas_sem_site_sp.csv');
    if (fs.existsSync(csvPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="empresas_sem_site_sp.csv"'
      });
      fs.createReadStream(csvPath).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Nenhum dado exportado ainda.');
      return;
    }
  }

  // Arquivos estáticos da pasta public/
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // Prevenir Directory Traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Acesso proibido');
    return;
  }

  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Não Encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  Buscador de Leads Sem Site - Painel Web Rodando!`);
  console.log(`  Acesse no navegador: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
